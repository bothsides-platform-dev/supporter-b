import type { DB } from '@/lib/db/client';
import { getRfpRepo } from '@/lib/server/repositories/factory';

/**
 * Atomically reserves the next RFP id for the current calendar year-month.
 * Format: `P-YYMM-NNNN` (zero-padded sequence within month).
 *
 * Pass a transaction-bound `tx` so the counter increment + RFP insert share
 * atomicity. Calling outside a transaction is allowed but loses that guarantee.
 *
 * Data access is delegated to RfpRepo.reserveNextCode (same `yymm` derivation +
 * `P-YYMM-NNNN` output). The `tx` is threaded through so the counter increment
 * stays in the caller's transaction.
 */
export async function nextRfpId(tx: DB): Promise<string> {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (await getRfpRepo()).reserveNextCode(yymm, tx);
}
