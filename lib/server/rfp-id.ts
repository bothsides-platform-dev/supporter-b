import { sql } from 'drizzle-orm';
import type { DB } from '@/lib/db/client';

/**
 * Atomically reserves the next RFP id for the current calendar year-month.
 * Format: `P-YYMM-NNNN` (zero-padded sequence within month).
 *
 * Pass a transaction-bound `tx` so the counter increment + RFP insert share
 * atomicity. Calling outside a transaction is allowed but loses that guarantee.
 */
export async function nextRfpId(tx: DB): Promise<string> {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const result = await tx.execute(sql`
    INSERT INTO rfp_counters(year_month, last_seq) VALUES (${yymm}, 1)
    ON CONFLICT (year_month) DO UPDATE SET last_seq = rfp_counters.last_seq + 1
    RETURNING last_seq
  `);
  // postgres-js returns an array of rows; pglite returns `{ rows: [...] }`.
  // Tolerate both so prod and the pglite test path share this util.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  const rows: Array<{ last_seq: number }> = Array.isArray(r)
    ? (r as Array<{ last_seq: number }>)
    : (r?.rows ?? []);
  const seq = rows[0].last_seq;
  return `P-${yymm}-${String(seq).padStart(4, '0')}`;
}
