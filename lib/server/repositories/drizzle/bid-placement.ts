import { eq, inArray } from 'drizzle-orm';
import { bidPlacements } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Placement } from '@/lib/types/column';
import type { PlacementRepo, Tx } from '../types';

type Row = typeof bidPlacements.$inferSelect;

export class DrizzleBidPlacementRepository implements PlacementRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async listByCards(cardIds: string[], tx?: Tx): Promise<Map<string, Placement>> {
    const map = new Map<string, Placement>();
    if (cardIds.length === 0) return map;
    const db = this.h(tx);
    const rows = (await db
      .select()
      .from(bidPlacements)
      .where(inArray(bidPlacements.bidId, cardIds))) as Row[];
    for (const r of rows) {
      map.set(r.bidId, { columnId: r.columnId, cardId: r.bidId, position: r.position });
    }
    return map;
  }

  async listByColumn(columnId: string, tx?: Tx): Promise<Placement[]> {
    const db = this.h(tx);
    const rows = (await db
      .select()
      .from(bidPlacements)
      .where(eq(bidPlacements.columnId, columnId))) as Row[];
    return rows.map((r) => ({ columnId: r.columnId, cardId: r.bidId, position: r.position }));
  }

  async upsert(columnId: string, cardId: string, position: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(bidPlacements)
      .values({ columnId, bidId: cardId, position })
      .onConflictDoUpdate({
        target: bidPlacements.bidId,
        set: { columnId, position, updatedAt: new Date() },
      });
  }

  async removeByCard(cardId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(bidPlacements).where(eq(bidPlacements.bidId, cardId));
  }
}
