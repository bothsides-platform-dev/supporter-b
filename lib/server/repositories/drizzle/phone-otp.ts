import { and, count, desc, eq, gt, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import type { PhoneOtpPurpose } from '@/lib/types/phone-otp';
import type { PhoneOtpRepo, Tx } from '../types';

type TransactionalDb = {
  transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T>;
};

export class DrizzlePhoneOtpRepository implements PhoneOtpRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
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

  async reserveIssuance(params: {
    phone: string;
    purpose: PhoneOtpPurpose;
    userId: string | null;
    codeHash: string;
    windowStart: Date;
    limit: number;
  }): Promise<string | undefined> {
    return (this._db as TransactionalDb).transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp:${params.phone}`}, 0))`,
      );

      const recentCount = await this.countRecent(params.phone, params.windowStart, tx);
      if (recentCount >= params.limit) return undefined;

      return this.create(
        {
          phone: params.phone,
          purpose: params.purpose,
          userId: params.userId,
          codeHash: params.codeHash,
          // Provider success is the activation boundary. Until then the row
          // consumes quota but cannot be selected by findActive().
          expiresAt: new Date(0),
        },
        tx,
      );
    });
  }

  async create(
    params: {
      phone: string;
      purpose: PhoneOtpPurpose;
      userId: string | null;
      codeHash: string;
      expiresAt: Date;
    },
    tx?: Tx,
  ): Promise<string> {
    const db = this.h(tx);
    const [row] = await db
      .insert(phoneOtps)
      .values({
        phone: params.phone,
        purpose: params.purpose,
        userId: params.userId,
        codeHash: params.codeHash,
        expiresAt: params.expiresAt,
      })
      .returning({ id: phoneOtps.id });
    return row.id;
  }

  async findActive(
    params: {
      phone: string;
      purpose: PhoneOtpPurpose;
      userId: string | null;
      now: Date;
    },
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
          eq(phoneOtps.phone, params.phone),
          eq(phoneOtps.purpose, params.purpose),
          params.userId === null
            ? isNull(phoneOtps.userId)
            : eq(phoneOtps.userId, params.userId),
          isNull(phoneOtps.verifiedAt),
          gt(phoneOtps.expiresAt, params.now),
        ),
      )
      // 최신 행 우선. 재전송은 이전 행을 무효화하지 않으므로 만료 전 재전송 시
      // 활성 행이 둘이 되는데, 사용자가 손에 든 건 방금 도착한 SMS 다. 가장 오래된
      // 행을 고르면 새 코드를 정확히 넣고도 계속 실패하며 시도 횟수만 소진한다.
      .orderBy(desc(phoneOtps.createdAt))
      .limit(1);
    return row ?? undefined;
  }

  async isConsumable(
    params: {
      id: string;
      phone: string;
      purpose: PhoneOtpPurpose;
      userId: string | null;
      now: Date;
    },
    tx?: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .select({ id: phoneOtps.id })
      .from(phoneOtps)
      .where(
        and(
          eq(phoneOtps.id, params.id),
          eq(phoneOtps.phone, params.phone),
          eq(phoneOtps.purpose, params.purpose),
          params.userId === null
            ? isNull(phoneOtps.userId)
            : eq(phoneOtps.userId, params.userId),
          isNotNull(phoneOtps.verifiedAt),
          gt(phoneOtps.proofExpiresAt, params.now),
          isNull(phoneOtps.consumedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async consumeVerified(
    params: {
      id: string;
      phone: string;
      purpose: PhoneOtpPurpose;
      userId: string | null;
      now: Date;
    },
    tx: Tx,
  ): Promise<boolean> {
    const rows = await tx
      .update(phoneOtps)
      .set({ consumedAt: params.now })
      .where(
        and(
          eq(phoneOtps.id, params.id),
          eq(phoneOtps.phone, params.phone),
          eq(phoneOtps.purpose, params.purpose),
          params.userId === null
            ? isNull(phoneOtps.userId)
            : eq(phoneOtps.userId, params.userId),
          isNotNull(phoneOtps.verifiedAt),
          gt(phoneOtps.proofExpiresAt, params.now),
          isNull(phoneOtps.consumedAt),
        ),
      )
      .returning({ id: phoneOtps.id });
    return rows.length === 1;
  }

  async bumpAttempts(id: string, maxAttempts: number, now: Date, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .update(phoneOtps)
      .set({ attempts: sql`${phoneOtps.attempts} + 1` })
      .where(and(
        eq(phoneOtps.id, id),
        lt(phoneOtps.attempts, maxAttempts),
        isNull(phoneOtps.verifiedAt),
        gt(phoneOtps.expiresAt, now),
      ))
      .returning({ id: phoneOtps.id });
    return rows.length === 1;
  }

  async markVerified(
    params: { id: string; verifiedAt: Date; proofExpiresAt: Date },
    tx?: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .update(phoneOtps)
      .set({
        verifiedAt: params.verifiedAt,
        proofExpiresAt: params.proofExpiresAt,
      })
      .where(
        and(
          eq(phoneOtps.id, params.id),
          isNull(phoneOtps.verifiedAt),
          gt(phoneOtps.expiresAt, params.verifiedAt),
        ),
      )
      .returning({ id: phoneOtps.id });
    return rows.length === 1;
  }

  async activate(id: string, expiresAt: Date, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(phoneOtps)
      .set({ expiresAt })
      .where(eq(phoneOtps.id, id));
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(phoneOtps).where(eq(phoneOtps.id, id));
  }
}
