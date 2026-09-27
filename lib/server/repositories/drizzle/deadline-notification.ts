import type { Tx } from '../types';
import { and, asc, eq, exists, gt, or } from 'drizzle-orm';
import { deadlineNotificationDeliveries, rfpRequoteRequests, rfps } from '@/lib/db/schema';

export type DeadlineDelivery = {
  key: string; rfpId: string; recipientUserId: string; kind: string; deadline: Date;
  pgWsId: string | null; reviewId: string | null; round: number | null;
};

export class DrizzleDeadlineNotificationRepository {
  constructor(private readonly db: Tx) {}
  private h(tx?: Tx): Tx { return tx ?? this.db; }
  async claim(record: DeadlineDelivery, tx?: Tx): Promise<boolean> {
    const rows = await this.h(tx).insert(deadlineNotificationDeliveries).values(record)
      .onConflictDoNothing().returning({ key: deadlineNotificationDeliveries.key });
    return rows.length === 1;
  }
  /** 유효 마감(공용 마감·pending 재요청 마감 중 가장 늦은 것)이 `closedAfter` 이후인 발송 견적만 — 오래전에 닫힌 견적은 보낼 알림이 없다. */
  async sentRfpIds(closedAfter: Date, after?: string, limit = 500, tx?: Tx): Promise<string[]> {
    const h = this.h(tx);
    const openRequote = h.select({ id: rfpRequoteRequests.id }).from(rfpRequoteRequests).where(and(
      eq(rfpRequoteRequests.rfpId, rfps.id), eq(rfpRequoteRequests.status, 'pending'), gt(rfpRequoteRequests.deadline, closedAfter)));
    const rows = await h.select({ id: rfps.id }).from(rfps)
      .where(and(eq(rfps.status, 'sent'), or(gt(rfps.deadline, closedAfter), exists(openRequote)), after ? gt(rfps.id, after) : undefined))
      .orderBy(asc(rfps.id)).limit(limit);
    return rows.map((row) => row.id);
  }
}
