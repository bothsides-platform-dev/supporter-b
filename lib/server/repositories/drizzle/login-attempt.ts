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

export class DrizzleLoginAttemptRepository implements LoginAttemptRepo {
  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
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
    const uniqueKeys = [...new Set(keys)].sort();
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
    if (keys.length === 0) return;
    const db = this.h(tx);
    await db
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
      .where(inArray(loginAttempts.key, keys));
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
    if (keys.length === 0) return; // empty array → no-op (avoid `IN ()`).
    const db = this.h(tx);
    await db.delete(loginAttempts).where(inArray(loginAttempts.key, keys));
  }
}
