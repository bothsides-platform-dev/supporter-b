// Generic pending email execution. Digest processors own their content policy.
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { flushGenericOutbox } from './dispatch';
import type { BatchSender } from './types';

const FLUSH_BATCH = 50;

export async function flushAllOutbox(
  sender: BatchSender,
  limit: number = FLUSH_BATCH,
): Promise<{ ok: number; failed: number }> {
  const outbox = await getOutboxRepo();
  return flushGenericOutbox(outbox, sender, limit);
}
