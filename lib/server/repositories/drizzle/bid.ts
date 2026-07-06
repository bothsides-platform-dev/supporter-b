import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { bids, attachments, rfps, workspaces } from '@/lib/db/schema';
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
  round: bids.round,
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
    round: row.round,
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
      .where(and(inArray(attachments.bidId, bidIds), eq(attachments.status, 'ready')))) as AttachmentRow[];
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
        round: bid.round,
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
          round: bid.round,
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
      .where(eq(bids.pgWsId, pgWsId))
      .orderBy(asc(bids.round))) as BidRow[];
    const proposals = await this.proposalsByBid(db, rows.map((r) => r.id));
    return rows.map((r) => rowToBid(r, proposals.get(r.id) ?? []));
  }

  async updateStatus(id: string, status: Bid['status'], tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(bids).set({ status }).where(eq(bids.id, id));
  }

  async searchForBuyer(wsId: string, pattern: string, tx?: Tx): Promise<unknown[]> {
    const db = this.h(tx);
    // bids⋈rfps⋈workspaces — mirrors searchEntitiesAction.ts (buyer bid branch).
    // rfpId is the RFP *code* (human id for URLs); pgWsName is the PG ws name.
    // Submitted bids only; pattern is escape+wrapped by the caller.
    return db
      .select({
        bidId: bids.id,
        rfpId: rfps.code,
        rfpTitle: rfps.title,
        pgWsName: workspaces.name,
        memo: bids.memo,
      })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .innerJoin(workspaces, eq(bids.pgWsId, workspaces.id))
      .where(
        and(
          eq(rfps.buyerWsId, wsId),
          eq(bids.status, 'submitted'),
          or(
            ilike(rfps.title, pattern),
            ilike(bids.memo, pattern),
            ilike(workspaces.name, pattern),
          ),
        ),
      )
      .orderBy(desc(bids.submittedAt))
      .limit(20);
  }

  async listForBuyer(wsId: string, limit: number, tx?: Tx): Promise<unknown[]> {
    const db = this.h(tx);
    // 초성 검색 companion — searchForBuyer 와 동일한 projection, ilike 없이
    // ws-scope+submitted 만 fetch. 호출자가 getChoseong 로 JS 필터한다.
    return db
      .select({
        bidId: bids.id,
        rfpId: rfps.code,
        rfpTitle: rfps.title,
        pgWsName: workspaces.name,
        memo: bids.memo,
      })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .innerJoin(workspaces, eq(bids.pgWsId, workspaces.id))
      .where(and(eq(rfps.buyerWsId, wsId), eq(bids.status, 'submitted')))
      .orderBy(desc(bids.submittedAt))
      .limit(limit);
  }

  async searchForPg(wsId: string, pattern: string, tx?: Tx): Promise<unknown[]> {
    const db = this.h(tx);
    // bids⋈rfps — mirrors searchEntitiesAction.ts (pg bid branch). No ws name
    // (PG sees its own bids). Submitted only; pattern is escape+wrapped.
    return db
      .select({
        bidId: bids.id,
        rfpId: rfps.code,
        rfpTitle: rfps.title,
        memo: bids.memo,
      })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .where(
        and(
          eq(bids.pgWsId, wsId),
          eq(bids.status, 'submitted'),
          or(ilike(rfps.title, pattern), ilike(bids.memo, pattern)),
        ),
      )
      .orderBy(desc(bids.submittedAt))
      .limit(20);
  }

  async listForPg(wsId: string, limit: number, tx?: Tx): Promise<unknown[]> {
    const db = this.h(tx);
    // 초성 검색 companion — searchForPg 와 동일한 projection (no pgWsName),
    // ilike 없이 pg-scope+submitted 만 fetch. 호출자가 getChoseong 로 JS 필터.
    return db
      .select({
        bidId: bids.id,
        rfpId: rfps.code,
        rfpTitle: rfps.title,
        memo: bids.memo,
      })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .where(and(eq(bids.pgWsId, wsId), eq(bids.status, 'submitted')))
      .orderBy(desc(bids.submittedAt))
      .limit(limit);
  }

  async findRfpOwner(
    bidId: string,
    tx?: Tx,
  ): Promise<{ rfpId: string; buyerWsId: string } | undefined> {
    const db = this.h(tx);
    // bids⋈rfps — upload/ACL gate: which RFP a bid belongs to + its owning buyer
    // ws. rfpId here is the surrogate uuid (FK), matching upload route usage.
    const [row] = await db
      .select({ rfpId: bids.rfpId, buyerWsId: rfps.buyerWsId })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .where(eq(bids.id, bidId))
      .limit(1);
    return row ?? undefined;
  }

  async findOwner(
    bidId: string,
    tx?: Tx,
  ): Promise<{ pgWsId: string; rfpId: string } | undefined> {
    const db = this.h(tx);
    // bids 단독 (rfps 조인 없음) — 첨부 ACL 의 PG fast-path 가 RFP 존재 여부와
    // 무관하게 bid.pgWsId 를 봐야 하므로 findRfpOwner 와 분리한 경량 projection.
    const [row] = await db
      .select({ pgWsId: bids.pgWsId, rfpId: bids.rfpId })
      .from(bids)
      .where(eq(bids.id, bidId))
      .limit(1);
    return row ?? undefined;
  }
}
