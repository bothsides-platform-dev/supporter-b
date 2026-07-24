import { eq } from 'drizzle-orm';
import { contracts } from '@/lib/db/schema';
import type { Contract } from '@/lib/types/contract';
import type { ContractRepo, Tx } from '../types';

type ContractRow = typeof contracts.$inferSelect;

function rowToContract(row: ContractRow): Contract {
  return {
    id: row.id,
    rfpId: row.rfpId,
    bidId: row.bidId,
    awardedAt: new Date(row.awardedAt).toISOString(),
    awardedBy: row.awardedBy,
  };
}

export class DrizzleContractRepository implements ContractRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async save(c: Contract, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(contracts)
      .values({
        id: c.id,
        rfpId: c.rfpId,
        bidId: c.bidId,
        awardedAt: new Date(c.awardedAt),
        awardedBy: c.awardedBy,
      })
      .onConflictDoNothing({ target: contracts.id });
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<Contract | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.rfpId, rfpId))
      .limit(1);
    return row ? rowToContract(row) : undefined;
  }
}
