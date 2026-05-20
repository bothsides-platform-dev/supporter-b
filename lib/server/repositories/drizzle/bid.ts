import { eq, inArray } from 'drizzle-orm';
import { bids, attachments } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Bid, BuyerStage, CardIssuer } from '@/lib/types/bid';
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
    // Public `url` is the authenticated route — never the storage key.
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
    deposit: Number(row.deposit),
    setupFee: Number(row.setupFee),
    monthlyMin: Number(row.monthlyMin),
    bankTransferFeePct: Number(row.bankTransferFeePct),
    easyPayFeePct: Number(row.easyPayFeePct),
    cardFeesByIssuer: (row.cardFeesByIssuer ?? undefined) as
      | Record<CardIssuer, number>
      | undefined,
    overseasCardFeePct:
      row.overseasCardFeePct == null ? undefined : Number(row.overseasCardFeePct),
    proposalPdfs,
    memo: row.memo,
    status: row.status,
    buyerStage: row.buyerStage,
    submittedBy: row.submittedBy,
    submittedAt: new Date(row.submittedAt).toISOString(),
  };
}

export class DrizzleBidRepository implements BidRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  // Batched proposal-attachment hydration — one query for all bid ids (no N+1).
  // Proposals are 1..N via attachments.bid_id (exclusive-arc, C3).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async proposalsByBid(db: any, bidIds: string[]): Promise<Map<string, Attachment[]>> {
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
        deposit: String(bid.deposit),
        setupFee: String(bid.setupFee),
        monthlyMin: String(bid.monthlyMin),
        bankTransferFeePct: String(bid.bankTransferFeePct),
        easyPayFeePct: String(bid.easyPayFeePct),
        cardFeesByIssuer: bid.cardFeesByIssuer ?? null,
        overseasCardFeePct:
          bid.overseasCardFeePct == null ? null : String(bid.overseasCardFeePct),
        memo: bid.memo ?? '',
        status: bid.status,
        submittedBy: bid.submittedBy,
        submittedAt: bid.submittedAt ? new Date(bid.submittedAt) : new Date(),
      })
      .onConflictDoUpdate({
        target: bids.id,
        set: {
          settleCycle: bid.settleCycle,
          deposit: String(bid.deposit),
          setupFee: String(bid.setupFee),
          monthlyMin: String(bid.monthlyMin),
          bankTransferFeePct: String(bid.bankTransferFeePct),
          easyPayFeePct: String(bid.easyPayFeePct),
          cardFeesByIssuer: bid.cardFeesByIssuer ?? null,
          overseasCardFeePct:
            bid.overseasCardFeePct == null ? null : String(bid.overseasCardFeePct),
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

  async findByPgWs(pgWsId: string, tx?: Tx): Promise<Bid[]> {
    const db = this.h(tx);
    const rows = (await db.select().from(bids).where(eq(bids.pgWsId, pgWsId))) as BidRow[];
    const proposals = await this.proposalsByBid(db, rows.map((r) => r.id));
    return rows.map((r) => rowToBid(r, proposals.get(r.id) ?? []));
  }

  async updateBuyerStage(
    bidId: string,
    to: BuyerStage,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    const updated = await db
      .update(bids)
      .set({ buyerStage: to })
      .where(eq(bids.id, bidId))
      .returning({ id: bids.id });
    if (updated.length === 0) {
      throw new Error(`Bid not found: ${bidId}`);
    }
  }
}
