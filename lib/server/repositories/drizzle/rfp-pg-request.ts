import { and, asc, eq, gt, notExists, sql } from 'drizzle-orm';
import { rfps, rfpAllowedPg, rfpPgRequests, workspaces } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { PgRequest, PgRequestStatus, OpportunityListing } from '@/lib/types/pg-request';
import type { PgRequestRepo, Tx } from '../types';

type ReqRow = typeof rfpPgRequests.$inferSelect;

function rowToPgRequest(row: ReqRow): PgRequest {
  return {
    id: row.id,
    rfpId: row.rfpId,
    pgWsId: row.pgWsId,
    message: row.message,
    status: row.status,
    createdByUserId: row.createdByUserId,
    decidedByUserId: row.decidedByUserId ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : undefined,
  };
}

export class DrizzleRfpRequestRepository implements PgRequestRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async create(req: PgRequest, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(rfpPgRequests).values({
      id: req.id,
      rfpId: req.rfpId,
      pgWsId: req.pgWsId,
      message: req.message,
      status: req.status,
      createdByUserId: req.createdByUserId,
      decidedByUserId: req.decidedByUserId ?? null,
      createdAt: new Date(req.createdAt),
      decidedAt: req.decidedAt ? new Date(req.decidedAt) : null,
    });
  }

  async findById(id: string, tx?: Tx): Promise<PgRequest | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(rfpPgRequests)
      .where(eq(rfpPgRequests.id, id))
      .limit(1);
    return row ? rowToPgRequest(row) : undefined;
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<PgRequest[]> {
    const db = this.h(tx);
    const rows = (await db
      .select()
      .from(rfpPgRequests)
      .where(eq(rfpPgRequests.rfpId, rfpId))
      .orderBy(asc(rfpPgRequests.createdAt))) as ReqRow[];
    return rows.map(rowToPgRequest);
  }

  async findPairStatus(
    rfpId: string,
    pgWsId: string,
    tx?: Tx,
  ): Promise<PgRequestStatus | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ status: rfpPgRequests.status })
      .from(rfpPgRequests)
      .where(and(eq(rfpPgRequests.rfpId, rfpId), eq(rfpPgRequests.pgWsId, pgWsId)))
      .limit(1);
    return (row?.status as PgRequestStatus | undefined) ?? undefined;
  }

  async markDecided(
    id: string,
    status: 'accepted' | 'rejected',
    decidedByUserId: string,
    at: Date,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    // 원자 전이 — 이미 결정된(pending 아님) 행은 WHERE 가 막아 no-op.
    await db
      .update(rfpPgRequests)
      .set({ status, decidedByUserId, decidedAt: at, updatedAt: at })
      .where(and(eq(rfpPgRequests.id, id), eq(rfpPgRequests.status, 'pending')));
  }

  async findOpenRfpsForPg(
    pgWsId: string,
    now: Date,
    tx?: Tx,
  ): Promise<OpportunityListing[]> {
    const db = this.h(tx);
    // 공개 경계: SELECT 절에 화이트리스트 컬럼만. 신원·마감·요청 결제수단·취급 상품(비경쟁
    // 정보)만 노출하고, 수수료·연거래량·현재조건·메모·bizProfile 등 경쟁정보는 절대 포함하지
    // 않는다(봉인입찰 모델). WHERE 로 노출 대상(sent·미마감·board_visible)을 좁히고, 이미
    // allowlist 됐거나 어떤 상태로든 요청이 있는 RFP는 제외.
    const rows = (await db
      .select({
        rfpCode: rfps.code,
        buyerName: workspaces.name,
        title: rfps.title,
        websiteUrl: rfps.websiteUrl,
        deadline: rfps.deadline,
        requiredPaymentMethods: rfps.requiredPaymentMethods,
        customPaymentMethods: rfps.customPaymentMethods,
        mainProducts: rfps.mainProducts,
        contractType: rfps.contractType,
      })
      .from(rfps)
      .innerJoin(workspaces, eq(rfps.buyerWsId, workspaces.id))
      .where(
        and(
          eq(rfps.status, 'sent'),
          gt(rfps.deadline, now),
          eq(rfps.boardVisible, true),
          notExists(
            db
              .select({ one: sql`1` })
              .from(rfpAllowedPg)
              .where(and(eq(rfpAllowedPg.rfpId, rfps.id), eq(rfpAllowedPg.pgWsId, pgWsId))),
          ),
          notExists(
            db
              .select({ one: sql`1` })
              .from(rfpPgRequests)
              .where(and(eq(rfpPgRequests.rfpId, rfps.id), eq(rfpPgRequests.pgWsId, pgWsId))),
          ),
        ),
      )
      .orderBy(asc(rfps.deadline))) as {
      rfpCode: string;
      buyerName: string;
      title: string;
      websiteUrl: string | null;
      deadline: Date;
      requiredPaymentMethods: string[] | null;
      customPaymentMethods: { id: string; label: string }[] | null;
      mainProducts: string | null;
      contractType: 'new' | 'renewal' | null;
    }[];
    return rows.map((r) => ({
      rfpCode: r.rfpCode,
      buyerName: r.buyerName,
      title: r.title,
      websiteUrl: r.websiteUrl ?? null,
      deadline: new Date(r.deadline).toISOString(),
      requiredPaymentMethods: r.requiredPaymentMethods ?? [],
      customPaymentMethodLabels: (r.customPaymentMethods ?? []).map((c) => c.label),
      mainProducts: r.mainProducts ?? null,
      contractType: r.contractType ?? null,
    }));
  }
}
