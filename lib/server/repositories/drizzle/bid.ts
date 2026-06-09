import { eq, inArray } from 'drizzle-orm';
import { bids, attachments } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Bid, PaymentMethod, TierRates } from '@/lib/types/bid';
import type { Attachment } from '@/lib/types/common';
import type { BidRepo, Tx } from '../types';

// Explicit column projections. `select().from(t)` compiles the FULL column list,
// so a future migration that adds a sensitive/large/unserialisable column to
// `bids` or `attachments` would silently flow into — or break — every read here
// (the #419 class already seen on `rfps`). Listing exactly the columns rowToBid /
// asAttachment consume makes the read drift-proof: new columns are ignored until
// added here on purpose.
const BID_COLUMNS = {
  id: bids.id,
  rfpId: bids.rfpId,
  pgWsId: bids.pgWsId,
  invitationId: bids.invitationId,
  settleCycle: bids.settleCycle,
  settleLimit: bids.settleLimit,
  guaranteeInsurance: bids.guaranteeInsurance,
  paymentFees: bids.paymentFees,
  customFees: bids.customFees,
  memo: bids.memo,
  status: bids.status,
  boardColumnId: bids.boardColumnId,
  submittedBy: bids.submittedBy,
  submittedAt: bids.submittedAt,
} as const;

const ATTACHMENT_COLUMNS = {
  id: attachments.id,
  bidId: attachments.bidId,
  name: attachments.name,
  size: attachments.size,
  mimeType: attachments.mimeType,
} as const;

type BidRow = {
  [K in keyof typeof BID_COLUMNS]: (typeof bids.$inferSelect)[K];
};
type AttachmentRow = Pick<
  typeof attachments.$inferSelect,
  'id' | 'bidId' | 'name' | 'size' | 'mimeType'
>;

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
    paymentFees: (row.paymentFees ?? {}) as Partial<Record<PaymentMethod, number | TierRates>>,
    customFees: (row.customFees ?? {}) as Record<string, number>,
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
      .select(ATTACHMENT_COLUMNS)
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
        customFees: bid.customFees,
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
          customFees: bid.customFees,
          memo: bid.memo ?? '',
          status: bid.status,
        },
      });
  }

  async findById(id: string, tx?: Tx): Promise<Bid | undefined> {
    const db = this.h(tx);
    const [row] = (await db
      .select(BID_COLUMNS)
      .from(bids)
      .where(eq(bids.id, id))
      .limit(1)) as BidRow[];
    if (!row) return undefined;
    const proposals = await this.proposalsByBid(db, [row.id]);
    return rowToBid(row, proposals.get(row.id) ?? []);
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<Bid[]> {
    const db = this.h(tx);
    const rows = (await db
      .select(BID_COLUMNS)
      .from(bids)
      .where(eq(bids.rfpId, rfpId))) as BidRow[];
    const proposals = await this.proposalsByBid(db, rows.map((r) => r.id));
    return rows.map((r) => rowToBid(r, proposals.get(r.id) ?? []));
  }

  async findByRfpIds(rfpIds: string[], tx?: Tx): Promise<Map<string, Bid[]>> {
    const db = this.h(tx);
    const map = new Map<string, Bid[]>();
    if (rfpIds.length === 0) return map;
    const rows = (await db
      .select(BID_COLUMNS)
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
    const rows = (await db
      .select(BID_COLUMNS)
      .from(bids)
      .where(eq(bids.pgWsId, pgWsId))) as BidRow[];
    const proposals = await this.proposalsByBid(db, rows.map((r) => r.id));
    return rows.map((r) => rowToBid(r, proposals.get(r.id) ?? []));
  }

  async setBoardColumn(bidId: string, columnId: string | null, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(bids).set({ boardColumnId: columnId }).where(eq(bids.id, bidId));
  }
}
