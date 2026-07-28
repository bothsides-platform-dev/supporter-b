import { pgProfiles } from '@/lib/db/schema';
import type { PgProfileRepo, Tx } from '../types';

export class DrizzlePgProfileRepository implements PgProfileRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async create(
    params: { workspaceId: string; bizNo: string; slaDays?: number | null },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(pgProfiles).values({
      workspaceId: params.workspaceId,
      bizNo: params.bizNo,
      serviceScope: null,
      slaDays: params.slaDays ?? null,
    });
  }
}
