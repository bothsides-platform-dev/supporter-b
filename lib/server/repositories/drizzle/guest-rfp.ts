import { and, asc, eq, sql, lt, gte, count } from 'drizzle-orm';
import { guestRfpEvents } from '@/lib/db/schema/guest-rfp';
import { pgRecommendationGroups } from '@/lib/db/schema/pg-recommendations';
import type { Tx } from '../types';
import type { PublicIndustry } from '@/lib/types/pg-recommendation';
export class DrizzleGuestRfpRepository {
  constructor(private readonly db: Tx) {}
  async industries(): Promise<PublicIndustry[]> {
    const rows = await this.db
      .select({
        id: pgRecommendationGroups.id,
        name: pgRecommendationGroups.name,
        mccCode: pgRecommendationGroups.mccCode,
      })
      .from(pgRecommendationGroups)
      .orderBy(
        asc(pgRecommendationGroups.sortOrder),
        asc(pgRecommendationGroups.name),
      );
    return rows.map(({ mccCode, ...row }) => ({
      ...row,
      ...(mccCode ? { mccCode } : {}),
    }));
  }
  async claim(
    draftId: string,
    event: 'started' | 'completed',
  ): Promise<boolean> {
    return this.db.transaction(async (tx: Tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(72640203)`);
      const now = Date.now();
      await tx.delete(guestRfpEvents).where(lt(guestRfpEvents.createdAt, new Date(now - 30 * 86400000)));
      const [recent] = await tx.select({ total: count() }).from(guestRfpEvents)
        .where(gte(guestRfpEvents.createdAt, new Date(now - 86400000)));
      if (recent.total >= 1000) return false;
      const rows = await tx.insert(guestRfpEvents).values({ draftId, event })
        .onConflictDoNothing().returning({ draftId: guestRfpEvents.draftId });
      return rows.length === 1;
    });
  }
  async finish(
    draftId: string,
    event: 'started' | 'completed',
    result: 'sent' | 'failed' | 'skipped',
  ) {
    await this.db
      .update(guestRfpEvents)
      .set({ result, processedAt: new Date() })
      .where(
        and(
          eq(guestRfpEvents.draftId, draftId),
          eq(guestRfpEvents.event, event),
        ),
      );
  }
}
