import type { Tx } from '../types';
import { and, asc, eq, gt } from 'drizzle-orm';
import { deadlineNotificationDeliveries, rfps } from '@/lib/db/schema';

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
  async sentRfpIds(after?: string, limit = 500, tx?: Tx): Promise<string[]> {
    const rows = await this.h(tx).select({ id: rfps.id }).from(rfps)
      .where(and(eq(rfps.status, 'sent'), after ? gt(rfps.id, after) : undefined))
      .orderBy(asc(rfps.id)).limit(limit);
    return rows.map((row) => row.id);
  }
}
