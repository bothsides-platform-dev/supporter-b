import { and, count, desc, eq, gt, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import type { PhoneOtpRepo, Tx } from '../types';

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
      // 최신 행 우선. 재전송은 이전 행을 무효화하지 않으므로 만료 전 재전송 시
      // 활성 행이 둘이 되는데, 사용자가 손에 든 건 방금 도착한 SMS 다. 가장 오래된
      // 행을 고르면 새 코드를 정확히 넣고도 계속 실패하며 시도 횟수만 소진한다.
      .orderBy(desc(phoneOtps.createdAt))
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
