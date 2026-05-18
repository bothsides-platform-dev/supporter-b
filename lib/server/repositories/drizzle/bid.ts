import { eq } from 'drizzle-orm';
import { bids, attachments } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Bid, CardIssuer } from '@/lib/types/bid';
import type { Attachment } from '@/lib/types/common';
import type { BidRepo, Tx } from '../types';

type BidRow = typeof bids.$inferSelect;
type AttachmentRow = typeof attachments.$inferSelect;

function asAttachment(att: AttachmentRow | null | undefined): Attachment {
  if (!att) {
    // Bid.proposalPdf is required in the type — return an empty placeholder for
    // bids that haven't yet attached a proposal. Callers should treat empty
    // url as "missing".
    return { id: '', name: '', size: 0, mimeType: '', url: '' };
  }
  return {
    id: att.id,
    name: att.name,
    size: att.size,
    mimeType: att.mimeType,
    url: att.storagePath,
  };
}

function rowToBid(row: BidRow, att: AttachmentRow | null | undefined): Bid {
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
    proposalPdf: asAttachment(att),
    memo: row.memo,
    status: row.status,
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
        proposalAttachmentId: bid.proposalPdf?.id || null,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchOne(db: any, where: ReturnType<typeof eq>) {
    const rows = await db
      .select({ b: bids, a: attachments })
      .from(bids)
      .leftJoin(attachments, eq(bids.proposalAttachmentId, attachments.id))
      .where(where);
    return rows;
  }

  async findById(id: string, tx?: Tx): Promise<Bid | undefined> {
    const db = this.h(tx);
    const [row] = await this.fetchOne(db, eq(bids.id, id));
    return row ? rowToBid(row.b, row.a) : undefined;
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<Bid[]> {
    const db = this.h(tx);
    const rows = await this.fetchOne(db, eq(bids.rfpId, rfpId));
    return rows.map((r: { b: BidRow; a: AttachmentRow | null }) =>
      rowToBid(r.b, r.a),
    );
  }

  async findByPgWs(pgWsId: string, tx?: Tx): Promise<Bid[]> {
    const db = this.h(tx);
    const rows = await this.fetchOne(db, eq(bids.pgWsId, pgWsId));
    return rows.map((r: { b: BidRow; a: AttachmentRow | null }) =>
      rowToBid(r.b, r.a),
    );
  }
}
