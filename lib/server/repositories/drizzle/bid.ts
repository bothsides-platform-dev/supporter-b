import { eq, inArray } from 'drizzle-orm';
import { bids, attachments } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Bid, PaymentMethod } from '@/lib/types/bid';
import type { Attachment } from '@/lib/types/common';
import type { BidRepo, Tx } from '../types';

type BidRow = typeof bids.$inferSelect;
type AttachmentRow = typeof attachments.$inferSelect;

function asAttachment(att: AttachmentRow): Attachment {
  return {
    id: att.id,
    name: att.name,
    size: att.size,
    mimeType: att.mimeType,
    url: `/api/files/${att.id}`,
  };
}

function rowToBid(row: BidRow, proposalPdfs: Attachment[]): Bid {
  return {
    id: row.id,
    rfpId: row.rfpId,
    pgWsId: row.pgWsId,
    invitationId: row.invitationId,
    settleCycle: row.settleCycle,
    settleLimit: Number(row.settleLimit),
    guaranteeInsurance: Number(row.guaranteeInsurance),
    paymentFees: (row.paymentFees ?? {}) as Partial<Record<PaymentMethod, number>>,
    proposalPdfs,
    memo: row.memo,
    status: row.status,
    submittedBy: row.submittedBy,
    submittedAt: new Date(row.submittedAt).toISOString(),
    boardColumnId: row.boardColumnId,
  };
}

export class DrizzleBidRepository implements BidRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  private async proposalsByBid(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    bidIds: string[],
  ): Promise<Map<string, Attachment[]>> {
    const map = new Map<string, Attachment[]>();
    if (bidIds.length === 0) return map;
    const rows = (await db
      .select()
      .from(attachments)
      .where(inArray(attachments.bidId, bidIds))) as AttachmentRow[];
    for (const att of rows) {
      const list = map.get(att.bidId!) ?? [];
      list.push(asAttachment(att));
      map.set(att.bidId!, list);
    }
    return map;
  }

  async save(bid: Bid, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(bids)
      .values({
        id: bid.id,
        rfpId: bid.rfpId,
        pgWsId: bid.pgWsId,
        invitationId: bid.invitationId,
        settleCycle: bid.settleCycle,
        settleLimit: String(bid.settleLimit),
        guaranteeInsurance: String(bid.guaranteeInsurance),
        paymentFees: bid.paymentFees,
        memo: bid.memo ?? '',
        status: bid.status,
        submittedBy: bid.submittedBy,
        submittedAt: bid.submittedAt ? new Date(bid.submittedAt) : new Date(),
      })
      .onConflictDoUpdate({
        target: bids.id,
        set: {
          settleCycle: bid.settleCycle,
          settleLimit: String(bid.settleLimit),
          guaranteeInsurance: String(bid.guaranteeInsurance),
          paymentFees: bid.paymentFees,
          memo: bid.memo ?? '',
          status: bid.status,
        },
      });
  }

  async findById(id: string, tx?: Tx): Promise<Bid | undefined> {
    const db = this.h(tx);
    const [row] = (await db.select().from(bids).where(eq(bids.id, id)).limit(1)) as BidRow[];
    if (!row) return undefined;
    const proposals = await this.proposalsByBid(db, [row.id]);
    return rowToBid(row, proposals.get(row.id) ?? []);
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<Bid[]> {
    const db = this.h(tx);
    const rows = (await db.select().from(bids).where(eq(bids.rfpId, rfpId))) as BidRow[];
    const proposals = await this.proposalsByBid(db, rows.map((r) => r.id));
    return rows.map((r) => rowToBid(r, proposals.get(r.id) ?? []));
  }

  async findByRfpIds(rfpIds: string[], tx?: Tx): Promise<Map<string, Bid[]>> {
    const db = this.h(tx);
    const map = new Map<string, Bid[]>();
    if (rfpIds.length === 0) return map;
    const rows = (await db
      .select()
      .from(bids)
      .where(inArray(bids.rfpId, rfpIds))) as BidRow[];
    const proposals = await this.proposalsByBid(db, rows.map((r) => r.id));
    for (const r of rows) {
      const bid = rowToBid(r, proposals.get(r.id) ?? []);
      const list = map.get(bid.rfpId) ?? [];
      list.push(bid);
      map.set(bid.rfpId, list);
    }
    return map;
  }

  async findByPgWs(pgWsId: string, tx?: Tx): Promise<Bid[]> {
    const db = this.h(tx);
    const rows = (await db.select().from(bids).where(eq(bids.pgWsId, pgWsId))) as BidRow[];
    const proposals = await this.proposalsByBid(db, rows.map((r) => r.id));
    return rows.map((r) => rowToBid(r, proposals.get(r.id) ?? []));
  }

  async setBoardColumn(bidId: string, columnId: string | null, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(bids).set({ boardColumnId: columnId }).where(eq(bids.id, bidId));
  }
}
