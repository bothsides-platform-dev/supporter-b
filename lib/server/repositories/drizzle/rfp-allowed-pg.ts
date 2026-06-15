import { and, eq } from 'drizzle-orm';
import { rfpAllowedPg } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { RfpAllowedPgRepo, Tx } from '../types';

export class DrizzleRfpAllowedPgRepository implements RfpAllowedPgRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async add(rfpId: string, pgWsIds: string[], tx?: Tx): Promise<void> {
    if (pgWsIds.length === 0) return; // empty array → no-op (no empty INSERT).
    const db = this.h(tx);
    await db
      .insert(rfpAllowedPg)
      .values(pgWsIds.map((pgWsId) => ({ rfpId, pgWsId })))
      .onConflictDoNothing();
  }

  async listPgWsIds(rfpId: string, tx?: Tx): Promise<string[]> {
    const db = this.h(tx);
    const rows = await db
      .select({ pgWsId: rfpAllowedPg.pgWsId })
      .from(rfpAllowedPg)
      .where(eq(rfpAllowedPg.rfpId, rfpId));
    return rows.map((r: { pgWsId: string }) => r.pgWsId);
  }

  async has(rfpId: string, pgWsId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .select({ pgWsId: rfpAllowedPg.pgWsId })
      .from(rfpAllowedPg)
      .where(and(eq(rfpAllowedPg.rfpId, rfpId), eq(rfpAllowedPg.pgWsId, pgWsId)))
      .limit(1);
    return rows.length > 0;
  }
}
