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

import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import type { Sender } from '@/lib/server/outbox/types';

const DEFAULT_FROM = 'send@supporter-b.store';

function resolveFrom(): string {
  return process.env.RESEND_FROM ?? DEFAULT_FROM;
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
    // Format intentionally distinct from the deleted
    // `[DEV signup-verify]` / `[DEV rfp-invite]` lines so the
    // `grep -rn "[DEV " lib/server` regression gate stays at 0 hits.
    // dedupeKey included per Step 10 spec, html intentionally excluded.
    console.log(
      `[email DEV] event=${entry.event} to=${entry.to} subject=${entry.subject} dedupeKey=${entry.dedupeKey ?? '-'}`,
    );
    return { ok: true };
  }

  try {
    const client = getClient(apiKey);
    const result = await client.emails.send({
      from: resolveFrom(),
      to: entry.to,
      subject: entry.subject,
      html: entry.html,
    });

    if ('error' in result && result.error) {
      const err = result.error as { name?: string; message?: string };
      const message = err.message ?? err.name ?? 'resend_unknown_error';
      Sentry.captureException(new Error(`Email send failed: ${message}`), {
        extra: {
          event: entry.event,
          to: entry.to,
          subject: entry.subject,
          dedupeKey: entry.dedupeKey ?? null,
        },
      });
      return { ok: false, error: message };
    }

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
    return { ok: false, error: (e as Error).message ?? 'resend_threw' };
  }
};

// Factory — used by callers that want to inject a sender (cron route, etc.).
// Exists so tests can stub a different sender via dependency injection while
// production callers stay on the env-driven `ResendSender` const.
export function getResendSender(): Sender {
  return ResendSender;
}
