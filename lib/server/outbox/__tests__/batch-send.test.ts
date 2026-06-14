// sendEntriesInBatches — chunk a list of outbox entries into <=EMAIL_BATCH_SIZE
// groups, call the BatchSender once per chunk (pacing between chunks), and return
// one SendResult per input entry aligned by index.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BatchSender, OutboxEntry } from '../types';
import { sendEntriesInBatches } from '../batch-send';

function makeEntry(id: string): OutboxEntry {
  return {
    id,
    event: 'rfp.invited',
    to: `${id}@e.com`,
    subject: 'S',
    html: '<a>x</a>',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    scheduledAt: new Date().toISOString(),
  };
}

const SAVED_SIZE = process.env.EMAIL_BATCH_SIZE;
const SAVED_INTERVAL = process.env.EMAIL_BATCH_INTERVAL_MS;

beforeEach(() => {
  // Deterministic + fast: small chunk size, no real waiting between chunks.
  process.env.EMAIL_BATCH_SIZE = '2';
  process.env.EMAIL_BATCH_INTERVAL_MS = '0';
});
afterEach(() => {
  if (SAVED_SIZE === undefined) delete process.env.EMAIL_BATCH_SIZE;
  else process.env.EMAIL_BATCH_SIZE = SAVED_SIZE;
  if (SAVED_INTERVAL === undefined) delete process.env.EMAIL_BATCH_INTERVAL_MS;
  else process.env.EMAIL_BATCH_INTERVAL_MS = SAVED_INTERVAL;
});

describe('sendEntriesInBatches', () => {
  it('chunks into EMAIL_BATCH_SIZE groups (5 entries, size 2 → 3 calls of [2,2,1])', async () => {
    const sender = vi.fn<BatchSender>().mockImplementation(async (es) => es.map(() => ({ ok: true })));
    const entries = ['a', 'b', 'c', 'd', 'e'].map(makeEntry);

    const results = await sendEntriesInBatches(sender, entries);

    expect(sender).toHaveBeenCalledTimes(3);
    expect(sender.mock.calls[0][0]).toHaveLength(2);
    expect(sender.mock.calls[1][0]).toHaveLength(2);
    expect(sender.mock.calls[2][0]).toHaveLength(1);
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('preserves per-entry result alignment across chunks', async () => {
    // Fail only the entry whose id is "c" (index 2, lands in the 2nd chunk).
    const sender = vi.fn<BatchSender>().mockImplementation(async (es) =>
      es.map((e) => (e.id === 'c' ? { ok: false as const, error: 'bad', retryable: false } : { ok: true as const })),
    );
    const entries = ['a', 'b', 'c', 'd', 'e'].map(makeEntry);

    const results = await sendEntriesInBatches(sender, entries);

    expect(results[2].ok).toBe(false);
    expect(results[0].ok).toBe(true);
    expect(results[4].ok).toBe(true);
  });

  it('returns [] without calling the sender for an empty list', async () => {
    const sender = vi.fn<BatchSender>().mockResolvedValue([]);
    const results = await sendEntriesInBatches(sender, []);
    expect(results).toEqual([]);
    expect(sender).not.toHaveBeenCalled();
  });

  it('fills a missing per-entry result with a retryable failure (defensive)', async () => {
    // Sender returns a short array (1 result for a 2-entry chunk).
    const sender = vi.fn<BatchSender>().mockResolvedValue([{ ok: true }]);
    const results = await sendEntriesInBatches(sender, [makeEntry('a'), makeEntry('b')]);
    expect(results).toHaveLength(2);
    expect(results[1].ok).toBe(false);
    if (!results[1].ok) expect(results[1].retryable).toBe(true);
  });
});
