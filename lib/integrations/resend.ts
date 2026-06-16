// ResendSender — concrete `Sender` (lib/server/outbox/types.ts) backed by the
// Resend HTTP API.
//
// Two operating modes, decided by `RESEND_API_KEY`:
//
//   1. `RESEND_API_KEY` set:    Resend.emails.send({ from, to, subject, html })
//      → maps API result to `{ ok: true } | { ok: false, error }`.
//
//   2. `RESEND_API_KEY` unset:  fallback. Logs `[email DEV] event=... to=...
//      subject=... dedupeKey=...` and resolves `{ ok: true }`. **html is never
//      logged** — it's verbose and contains links not safe to dump in shared
//      terminal scrollback. The console line replaces the legacy
//      `devLogVerifyLink` / `devLogRfpInviteLink` helpers (now deleted).
//
// `from` defaults to `send@supporter-b.store` (override with `RESEND_FROM`). For
// production sending, the resolved `from` MUST be on a domain verified in the
// Resend dashboard — Resend rejects `from` addresses on unverified domains
// with HTTP 403.

import { createHash } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import type { BatchSender, OutboxEntry, Sender } from '@/lib/server/outbox/types';
import { logger } from '@/lib/observability/logger';

const DEFAULT_FROM = 'send@supporter-b.store';

function resolveFrom(): string {
  return process.env.RESEND_FROM ?? DEFAULT_FROM;
}

// Resend error names (RESEND_ERROR_CODE_KEY) that are worth retrying — transient
// server/throttle conditions. Everything else (validation, auth, bad address) is
// a permanent config/payload error: retrying just burns attempts.
const RETRYABLE_ERROR_NAMES = new Set([
  'rate_limit_exceeded',
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
  'internal_server_error',
  'application_error',
]);

// Permanent config/payload errors — retrying only burns attempts. (Subset of
// RESEND_ERROR_CODE_KEY that we can definitively call non-transient.)
const PERMANENT_ERROR_NAMES = new Set([
  'validation_error',
  'invalid_from_address',
  'invalid_access',
  'invalid_parameter',
  'invalid_region',
  'invalid_attachment',
  'missing_required_field',
  'missing_api_key',
  'invalid_api_key',
  'restricted_api_key',
  'security_error',
  'not_found',
  'method_not_allowed',
  'invalid_idempotency_key',
]);

/**
 * Classify a Resend API error into retryable (back off + retry) vs permanent
 * (fail fast). Prefers the error `name` (matched against the retryable/permanent
 * sets), then `statusCode` (429 / 5xx → retryable, other 4xx → permanent).
 * Anything we can't place is treated as retryable — maxAttempts caps any runaway
 * and we'd rather over-retry a transient blip than silently drop a real mail.
 */
export function classifyResendError(
  err: { name?: string; statusCode?: number | null } | undefined | null,
): { retryable: boolean; retryAfterMs?: number } {
  const name = err?.name;
  if (name && RETRYABLE_ERROR_NAMES.has(name)) return { retryable: true };
  if (name && PERMANENT_ERROR_NAMES.has(name)) return { retryable: false };

  const status = err?.statusCode;
  if (typeof status === 'number') {
    if (status === 429 || status >= 500) return { retryable: true };
    if (status >= 400) return { retryable: false };
  }

  return { retryable: true };
}

// Deterministic idempotency key for a batch send: derived from the sorted set of
// outbox row ids. A crash/DB-failure between batch.send and markResult re-claims
// the SAME rows → same key → Resend dedupes (no duplicate emails). A later flush
// of a DIFFERENT subset (some rows already sent) produces a different key, so it
// is not falsely deduped. Generic-batch payloads have static html, so deduping an
// identical-subset retry never serves stale content.
function batchIdempotencyKey(entries: OutboxEntry[]): string {
  const ids = entries
    .map((e) => e.id)
    .sort()
    .join(',');
  return createHash('sha256').update(ids).digest('hex');
}

function devLogEntry(entry: OutboxEntry): void {
  // Format intentionally distinct from the deleted `[DEV signup-verify]` lines
  // so the `grep -rn "[DEV " lib/server` regression gate stays at 0 hits.
  // html intentionally excluded (verbose, contains links).
  console.log(
    `[email DEV] event=${entry.event} to=${entry.to} subject=${entry.subject} dedupeKey=${entry.dedupeKey ?? '-'}`,
  );
}

let cachedClient: Resend | null = null;
function getClient(apiKey: string): Resend {
  if (!cachedClient) {
    cachedClient = new Resend(apiKey);
  }
  return cachedClient;
}

// Test hook — clear the cached client so a different API key (or no key) can
// be re-evaluated between tests. Production code never calls this.
export function __resetResendClientForTest(): void {
  cachedClient = null;
}

export const ResendSender: Sender = async (entry) => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    devLogEntry(entry);
    return { ok: true };
  }

  try {
    const client = getClient(apiKey);
    const t0 = Date.now();
    const result = await client.emails.send(
      {
        from: resolveFrom(),
        to: entry.to,
        subject: entry.subject,
        html: entry.html,
      },
      // Idempotency key = the outbox row id. If markResult fails after a
      // successful send, the next flush re-sends with the same key and Resend
      // dedupes instead of delivering a duplicate.
      { idempotencyKey: entry.id },
    );

    if ('error' in result && result.error) {
      const err = result.error as { name?: string; message?: string; statusCode?: number | null };
      const message = err.message ?? err.name ?? 'resend_unknown_error';
      const cls = classifyResendError(err);
      Sentry.captureException(new Error(`Email send failed: ${message}`), {
        extra: {
          event: entry.event,
          to: entry.to,
          subject: entry.subject,
          dedupeKey: entry.dedupeKey ?? null,
        },
      });
      return { ok: false, error: message, retryable: cls.retryable, retryAfterMs: cls.retryAfterMs };
    }

    // Resend SDK doesn't export the success `data` shape; the cast is safe after the error guard above.
    logger.info('email.sent', {
      event: entry.event,
      to: entry.to,
      messageId: (result as { data?: { id?: string } | null }).data?.id ?? null,
      durationMs: Date.now() - t0,
    });
    return { ok: true };
  } catch (e) {
    Sentry.captureException(e, {
      extra: {
        event: entry.event,
        to: entry.to,
        subject: entry.subject,
        dedupeKey: entry.dedupeKey ?? null,
      },
    });
    // A thrown error is a transport-level failure (network, timeout) — transient,
    // so retryable.
    return { ok: false, error: (e as Error).message ?? 'resend_threw', retryable: true };
  }
};

// Factory — used by callers that want to inject a sender (cron route, etc.).
// Exists so tests can stub a different sender via dependency injection while
// production callers stay on the env-driven `ResendSender` const.
export function getResendSender(): Sender {
  return ResendSender;
}

// ResendBatchSender — concrete `BatchSender` backed by Resend's `batch.send`.
//
// Sends up to 100 distinct emails in ONE network round-trip (the caller, e.g.
// the outbox flush, is responsible for chunking to <= 100 and pacing between
// chunks). This is the core rate-limit fix: an N-recipient fan-out becomes
// ceil(N/100) API calls instead of N, so a burst of RFP invites / bid
// notifications no longer trips Resend's per-second limit.
//
// `batchValidation: 'permissive'` so one bad recipient doesn't reject the whole
// batch — valid emails still send and the failed indices come back in
// `data.failed[]`, which we map to permanent (non-retryable) per-entry failures.
//
// Mirrors ResendSender's two modes: no `RESEND_API_KEY` → per-entry dev log,
// all ok. Returns one SendResult per input entry, aligned by index.
export const ResendBatchSender: BatchSender = async (entries) => {
  if (entries.length === 0) return [];

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    for (const entry of entries) devLogEntry(entry);
    return entries.map(() => ({ ok: true }));
  }

  const client = getClient(apiKey);
  const from = resolveFrom();
  const payload = entries.map((e) => ({
    from,
    to: e.to,
    subject: e.subject,
    html: e.html,
  }));

  try {
    const t0 = Date.now();
    const result = await client.batch.send(payload, {
      batchValidation: 'permissive',
      idempotencyKey: batchIdempotencyKey(entries),
    });

    if ('error' in result && result.error) {
      // Whole-batch failure (auth / rate-limit / 5xx). Classify once, apply to
      // every entry so they all back off (or fail fast) together.
      const err = result.error as { name?: string; message?: string; statusCode?: number | null };
      const message = err.message ?? err.name ?? 'resend_batch_error';
      const cls = classifyResendError(err);
      Sentry.captureException(new Error(`Email batch send failed: ${message}`), {
        extra: { count: entries.length, name: err.name ?? null },
      });
      return entries.map(() => ({
        ok: false as const,
        error: message,
        retryable: cls.retryable,
        retryAfterMs: cls.retryAfterMs,
      }));
    }

    // Success — permissive mode reports per-entry failures in `errors[]` (NOT
    // `failed`), each carrying the original-input `index`. (Verified against the
    // resend SDK's CreateBatchSuccessResponse type — getting this field name
    // wrong silently maps every bad recipient to ok.)
    const success = (result as {
      data?: { data?: { id?: string }[]; errors?: { index: number; message?: string }[] } | null;
    }).data;
    const failedIndices = new Set((success?.errors ?? []).map((e) => e.index));

    logger.info('email.batch_sent', {
      count: entries.length,
      failed: failedIndices.size,
      durationMs: Date.now() - t0,
    });

    return entries.map((_, i) =>
      failedIndices.has(i)
        ? // A per-entry validation failure (bad payload/recipient) is permanent.
          { ok: false as const, error: 'batch_validation_failed', retryable: false }
        : { ok: true as const },
    );
  } catch (e) {
    Sentry.captureException(e, { extra: { count: entries.length } });
    // Transport-level failure for the whole call — retryable for every entry.
    return entries.map(() => ({
      ok: false as const,
      error: (e as Error).message ?? 'resend_batch_threw',
      retryable: true,
    }));
  }
};

/** Factory mirror of getResendSender for the batch path (cron/post-commit). */
export function getResendBatchSender(): BatchSender {
  return ResendBatchSender;
}
