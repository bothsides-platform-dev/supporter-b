// sendEntriesInBatches — drive a BatchSender over a list of outbox entries in
// rate-safe chunks.
//
// Resend's batch endpoint accepts up to 100 emails per request and that request
// counts as ONE call against the per-second rate limit. So we chunk to <=100 and
// pace consecutive chunks (EMAIL_BATCH_INTERVAL_MS) to keep even a multi-chunk
// drain comfortably under the limit. Returns one SendResult per input entry,
// aligned by index, so callers can map each back to its row for markResult.
//
// Config (env, tunable without a deploy):
//   EMAIL_BATCH_SIZE        (default 100, hard-capped at Resend's 100)
//   EMAIL_BATCH_INTERVAL_MS (default 600 — ms to wait between chunks)

import type { BatchSender, OutboxEntry, SendResult } from './types';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 100; // Resend batch endpoint hard limit.
const DEFAULT_INTERVAL_MS = 600;

function batchSize(): number {
  const n = Number(process.env.EMAIL_BATCH_SIZE);
  if (Number.isFinite(n) && n > 0) return Math.min(n, MAX_BATCH_SIZE);
  return DEFAULT_BATCH_SIZE;
}

function intervalMs(): number {
  const n = Number(process.env.EMAIL_BATCH_INTERVAL_MS);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_INTERVAL_MS;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function sendEntriesInBatches(
  batchSender: BatchSender,
  entries: OutboxEntry[],
): Promise<SendResult[]> {
  const size = batchSize();
  const interval = intervalMs();
  const out: SendResult[] = [];

  for (let i = 0; i < entries.length; i += size) {
    if (i > 0) await delay(interval); // pace between chunks (not before the first)
    const chunk = entries.slice(i, i + size);
    const res = await batchSender(chunk);
    for (let j = 0; j < chunk.length; j++) {
      // Defensive: a sender that returns a short/sparse array shouldn't drop a
      // row silently — treat a missing result as a retryable failure.
      out.push(res[j] ?? { ok: false, error: 'no_result', retryable: true });
    }
  }

  return out;
}
