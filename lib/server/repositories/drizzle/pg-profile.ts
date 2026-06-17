import { pgProfiles } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { PgProfileRepo, Tx } from '../types';

export class DrizzlePgProfileRepository implements PgProfileRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
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
