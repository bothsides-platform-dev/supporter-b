import { eq, inArray } from 'drizzle-orm';
import { loginAttempts } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { LoginAttemptRecord, LoginAttemptRepo, Tx } from '../types';

export class DrizzleLoginAttemptRepository implements LoginAttemptRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async findByKey(
    key: string,
    tx?: Tx,
  ): Promise<LoginAttemptRecord | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ count: loginAttempts.count, lockedUntil: loginAttempts.lockedUntil })
      .from(loginAttempts)
      .where(eq(loginAttempts.key, key))
      .limit(1);
    if (!row) return undefined;
    return {
      count: row.count,
      lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
    };
  }

  async upsert(
    key: string,
    rec: { count: number; lockedUntil: Date | null; updatedAt: Date },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(loginAttempts)
      .values({
        key,
        count: rec.count,
        lockedUntil: rec.lockedUntil,
        updatedAt: rec.updatedAt,
      })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: { count: rec.count, lockedUntil: rec.lockedUntil, updatedAt: rec.updatedAt },
      });
  }

  async clear(keys: string[], tx?: Tx): Promise<void> {
    if (keys.length === 0) return; // empty array → no-op (avoid `IN ()`).
    const db = this.h(tx);
    await db.delete(loginAttempts).where(inArray(loginAttempts.key, keys));
  }
}
