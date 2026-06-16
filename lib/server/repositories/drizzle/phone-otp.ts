import { and, asc, count, eq, gt, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { PhoneOtpRepo, Tx } from '../types';

export class DrizzlePhoneOtpRepository implements PhoneOtpRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async countRecent(phone: string, since: Date, tx?: Tx): Promise<number> {
    const db = this.h(tx);
    const [{ value }] = await db
      .select({ value: count() })
      .from(phoneOtps)
      .where(and(eq(phoneOtps.phone, phone), gte(phoneOtps.createdAt, since)));
    return Number(value);
  }

  async create(
    params: { phone: string; codeHash: string; expiresAt: Date },
    tx?: Tx,
  ): Promise<string> {
    const db = this.h(tx);
    const [row] = await db
      .insert(phoneOtps)
      .values({
        phone: params.phone,
        codeHash: params.codeHash,
        expiresAt: params.expiresAt,
      })
      .returning({ id: phoneOtps.id });
    return row.id;
  }

  async findActive(
    phone: string,
    now: Date,
    tx?: Tx,
  ): Promise<{ id: string; codeHash: string; attempts: number } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({
        id: phoneOtps.id,
        codeHash: phoneOtps.codeHash,
        attempts: phoneOtps.attempts,
      })
      .from(phoneOtps)
      .where(
        and(
          eq(phoneOtps.phone, phone),
          isNull(phoneOtps.verifiedAt),
          gt(phoneOtps.expiresAt, now),
        ),
      )
      .orderBy(asc(phoneOtps.createdAt))
      .limit(1);
    return row ?? undefined;
  }

  async isVerified(id: string, phone: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .select({ id: phoneOtps.id })
      .from(phoneOtps)
      .where(
        and(
          eq(phoneOtps.id, id),
          eq(phoneOtps.phone, phone),
          isNotNull(phoneOtps.verifiedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async bumpAttempts(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(phoneOtps)
      .set({ attempts: sql`${phoneOtps.attempts} + 1` })
      .where(eq(phoneOtps.id, id));
  }

  async markVerified(id: string, at: Date, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(phoneOtps)
      .set({ verifiedAt: at })
      .where(eq(phoneOtps.id, id));
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(phoneOtps).where(eq(phoneOtps.id, id));
  }
}
