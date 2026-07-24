import { eq } from 'drizzle-orm';
import { bizProfiles } from '@/lib/db/schema';
import type { BizProfile } from '@/lib/types/biz-profile';
import type { BizProfileRepo, Tx } from '../types';

type BizRow = typeof bizProfiles.$inferSelect;

function rowToProfile(row: BizRow): BizProfile & { id: string } {
  return {
    id: row.id,
    bizNo: row.bizNo ?? undefined,
    taxType: row.taxType ?? undefined,
    status: row.status ?? undefined,
    grade: row.grade ?? undefined,
    gradeSource: row.gradeSource,
    gradeConfirmedBy: row.gradeConfirmedBy ?? undefined,
    gradeConfirmedAt: row.gradeConfirmedAt
      ? new Date(row.gradeConfirmedAt).toISOString()
      : undefined,
  };
}

export class DrizzleBizProfileRepository implements BizProfileRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async save(profile: BizProfile & { id: string }, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(bizProfiles).values({
      id: profile.id,
      bizNo: profile.bizNo ?? null,
      taxType: profile.taxType ?? null,
      status: profile.status ?? null,
      grade: profile.grade ?? null,
      gradeSource: profile.gradeSource,
      gradeConfirmedBy: profile.gradeConfirmedBy ?? null,
      gradeConfirmedAt: profile.gradeConfirmedAt
        ? new Date(profile.gradeConfirmedAt)
        : null,
    });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<(BizProfile & { id: string }) | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, id))
      .limit(1);
    return row ? rowToProfile(row) : undefined;
  }
}
