import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { loginAttempts } from '@/lib/db/schema';
import type {
  LoginAttemptRecord,
  LoginAttemptRepo,
  LoginAttemptReservation,
  LoginAttemptReservationResult,
  Tx,
} from '../types';

class ActiveLoginLock extends Error {
  constructor(readonly lockedUntil: Date) {
    super('LOGIN_ATTEMPT_LOCKED');
  }
}

type TransactionalDb = {
  transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T>;
};

/**
 * The row lock order for every multi-key write. One `IN (...)` statement will
 * not do: it locks in scan order and deadlocks against reserve(). Sorting in SQL
 * will not either, because the database collation can disagree with this sort.
 */
function inLockOrder(keys: string[]): string[] {
  return [...new Set(keys)].sort();
}

export class DrizzleLoginAttemptRepository implements LoginAttemptRepo {
  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  /** One statement per key, in lock order, still all-or-nothing. */
  private async writeEachKey(
    keys: string[],
    tx: Tx | undefined,
    write: (db: Tx, key: string) => Promise<unknown>,
  ): Promise<void> {
    const ordered = inLockOrder(keys);
    if (ordered.length === 0) return;
    await (this.h(tx) as TransactionalDb).transaction(async (inner) => {
      for (const key of ordered) await write(inner, key);
    });
  }

  async findByKey(
    key: string,
    tx?: Tx,
  ): Promise<LoginAttemptRecord | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({
        count: loginAttempts.count,
        lockedUntil: loginAttempts.lockedUntil,
      })
      .from(loginAttempts)
      .where(eq(loginAttempts.key, key))
      .limit(1);
    if (!row) return undefined;
    return {
      count: row.count,
      lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
    };
  }

  async reserve(
    keys: string[],
    input: { threshold: number; now: Date; lockUntil: Date },
  ): Promise<LoginAttemptReservationResult> {
    const uniqueKeys = inLockOrder(keys);
    if (uniqueKeys.length === 0) return { allowed: true, records: [] };

    try {
      return await (this._db as TransactionalDb).transaction(async (tx) => {
        const records: LoginAttemptReservation[] = [];
        for (const key of uniqueKeys) {
          const [row] = await tx
            .insert(loginAttempts)
            .values({
              key,
              count: 1,
              lockedUntil: input.threshold <= 1 ? input.lockUntil : null,
              updatedAt: input.now,
            })
            .onConflictDoUpdate({
              target: loginAttempts.key,
              set: {
                count: sql<number>`case
                  when ${loginAttempts.lockedUntil} is not null then 1
                  else ${loginAttempts.count} + 1
                end`,
                lockedUntil: sql<Date | null>`case
                  when ${loginAttempts.lockedUntil} is not null
                    then ${input.threshold <= 1 ? input.lockUntil.toISOString() : null}::timestamptz
                  when ${loginAttempts.count} + 1 >= ${input.threshold}
                    then ${input.lockUntil.toISOString()}::timestamptz
                  else null::timestamptz
                end`,
                updatedAt: input.now,
              },
              setWhere: or(isNull(loginAttempts.lockedUntil), lte(loginAttempts.lockedUntil, input.now)),
            })
            .returning({
              key: loginAttempts.key,
              count: loginAttempts.count,
              lockedUntil: loginAttempts.lockedUntil,
            });

          if (!row) {
            const [active] = await tx
              .select({ lockedUntil: loginAttempts.lockedUntil })
              .from(loginAttempts)
              .where(
                and(
                  inArray(loginAttempts.key, uniqueKeys),
                  gt(loginAttempts.lockedUntil, input.now),
                ),
              )
              .orderBy(desc(loginAttempts.lockedUntil))
              .limit(1);
            throw new ActiveLoginLock(active?.lockedUntil ? new Date(active.lockedUntil) : input.lockUntil);
          }

          records.push({
            key: row.key,
            count: row.count,
            lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
          });
        }
        return { allowed: true, records };
      });
    } catch (error) {
      if (error instanceof ActiveLoginLock) {
        return { allowed: false, lockedUntil: error.lockedUntil };
      }
      throw error;
    }
  }

  async release(keys: string[], threshold: number, tx?: Tx): Promise<void> {
    await this.writeEachKey(keys, tx, (db, key) =>
      db
        .update(loginAttempts)
        .set({
          count: sql<number>`greatest(${loginAttempts.count} - 1, 0)`,
          lockedUntil: sql<Date | null>`case
            when ${loginAttempts.lockedUntil} is not null
              and ${loginAttempts.count} <= ${threshold}
              then null
            else ${loginAttempts.lockedUntil}
          end`,
        })
        .where(eq(loginAttempts.key, key)),
    );
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
        set: {
          count: rec.count,
          lockedUntil: rec.lockedUntil,
          updatedAt: rec.updatedAt,
        },
      });
  }

  async clear(keys: string[], tx?: Tx): Promise<void> {
    await this.writeEachKey(keys, tx, (db, key) =>
      db.delete(loginAttempts).where(eq(loginAttempts.key, key)),
    );
  }
}
