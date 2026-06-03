// flushAllOutbox — one-line orchestrator over the GENERIC outbox flush.
//
// The generic flush (DrizzleOutboxRepository.flush) drains every pending row
// EXCEPT event='chat.message' (those coalesced digests are owned by
// flushChatDigests). This thin wrapper exists so the cron route can drive the
// generic flush through a single mockable symbol, keeping the route's test
// focused purely on the auth gate rather than the repository factory.
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import type { Sender } from './types';

const FLUSH_BATCH = 50;

export async function flushAllOutbox(
  sender: Sender,
  limit: number = FLUSH_BATCH,
): Promise<{ ok: number; failed: number }> {
  const outbox = await getOutboxRepo();
  return outbox.flush(sender, limit);
}
