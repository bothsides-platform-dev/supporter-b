// Post-commit outbox flush — fire-and-forget after a successful action tx.
//
// Action callers do:
//   const r = await db.transaction(async (tx) => { ... outbox.enqueue(tx) ... });
//   if (r.ok) flushAfterCommit();
//
// `after()` keeps the Vercel lambda alive past the HTTP response so the flush
// completes before the invocation is torn down. Errors are swallowed (logged
// only) — we never want a flush failure to surface as an action error to the
// user.
//
// `after()` requires a Next.js request scope and throws if called outside one
// (e.g., vitest integration tests). The try/catch lets tests call action
// functions without mocking `next/server` — the flush is a no-op there, and
// integration tests verify outbox state via direct DB inspection instead.

import { after } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { logger } from '@/lib/observability/logger';
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { getResendBatchSender } from '@/lib/integrations/resend';

const FLUSH_BATCH = 50;

async function doFlush(): Promise<void> {
  try {
    const outbox = await getOutboxRepo();
    await outbox.flush(getResendBatchSender(), FLUSH_BATCH);
  } catch (err) {
    logger.error('outbox.post_commit_failed', { err });
    Sentry.captureException(err, { extra: { context: 'post-commit-flush' } });
  }
}

export function flushAfterCommit(): void {
  try {
    after(doFlush);
  } catch {
    // Outside a Next.js request scope — no-op. Integration tests hit this
    // path and verify the outbox via direct DB queries rather than flush.
  }
}
