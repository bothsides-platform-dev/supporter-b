import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { rfps, bizProfiles, rfpAllowedPg } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { RFP, RfpStatus } from '@/lib/types/rfp';
import type { CustomPaymentMethod, PaymentMethod } from '@/lib/types/bid';
import type { BizProfile } from '@/lib/types/biz-profile';
import { assertTransition } from '../../rfp-state';
import type { NewRfpInsert, RfpRepo, Tx } from '../types';

type RfpRow = typeof rfps.$inferSelect;
type BizRow = typeof bizProfiles.$inferSelect;

function toIso(d: Date | null | undefined): string | undefined {
  return d ? new Date(d).toISOString() : undefined;
}

function rowToRfp(row: RfpRow, biz: BizRow | null, allowed: string[]): RFP {
  const profile: BizProfile | undefined = biz
    ? {
        bizNo: biz.bizNo ?? undefined,
        taxType: biz.taxType ?? undefined,
        status: biz.status ?? undefined,
        grade: biz.grade ?? undefined,
        gradeSource: biz.gradeSource,
        gradeConfirmedBy: biz.gradeConfirmedBy ?? undefined,
        gradeConfirmedAt: toIso(biz.gradeConfirmedAt),
      }
    : undefined;
  return {
    id: row.id,
    code: row.code,
    buyerWsId: row.buyerWsId,
    bizProfile: profile,
    title: row.title,
    memo: row.memo,
    websiteUrl: row.websiteUrl ?? undefined,
    mainProducts: row.mainProducts ?? undefined,
    annualPgVolume: row.annualPgVolume ?? undefined,
    currentFeeRate: row.currentFeeRate ?? undefined,
    currentSettlementLimit: row.currentSettlementLimit ?? undefined,
    currentGuaranteeInsurance: row.currentGuaranteeInsurance ?? undefined,
    currentSettlementCycle: row.currentSettlementCycle ?? undefined,
    deliveryServicePeriod: row.deliveryServicePeriod ?? undefined,
    currentSolution: row.currentSolution ?? undefined,
    currentSolutionDetail: row.currentSolutionDetail ?? undefined,
    rfpFiles: [], // attachments hydrated separately when needed
    allowedPgWorkspaceIds: allowed,
    deadline: new Date(row.deadline).toISOString(),
    status: row.status,
    awardedBidId: row.awardedBidId ?? undefined,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    sentAt: toIso(row.sentAt),
    updatedAt: new Date(row.updatedAt).toISOString(),
    boardColumnId: row.boardColumnId,
    requiredPaymentMethods: (row.requiredPaymentMethods ?? []) as PaymentMethod[],
    customPaymentMethods: (row.customPaymentMethods ?? []) as CustomPaymentMethod[],
    boardVisible: row.boardVisible,
    currentFeeVisibleToPg: row.currentFeeVisibleToPg,
    isSample: row.isSample,
    contractType: row.contractType ?? null,
  };
}

export class DrizzleRfpRepository implements RfpRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  // Batched allowlist hydration — one query for all rfp ids (no N+1).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async allowedByRfp(db: any, rfpIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (rfpIds.length === 0) return map;
    const rows = await db
      .select({ rfpId: rfpAllowedPg.rfpId, pgWsId: rfpAllowedPg.pgWsId })
      .from(rfpAllowedPg)
      .where(inArray(rfpAllowedPg.rfpId, rfpIds));
    for (const r of rows as { rfpId: string; pgWsId: string }[]) {
      const list = map.get(r.rfpId) ?? [];
      list.push(r.pgWsId);
      map.set(r.rfpId, list);
    }
    return map;
  }

  // Replace the allowlist join rows for one RFP with the given workspace ids.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async syncAllowlist(db: any, rfpId: string, pgWsIds: string[]): Promise<void> {
    await db.delete(rfpAllowedPg).where(eq(rfpAllowedPg.rfpId, rfpId));
    if (pgWsIds.length > 0) {
      // Dedupe to respect the (rfp_id, pg_ws_id) PK.
      const unique = [...new Set(pgWsIds)];
      await db.insert(rfpAllowedPg).values(unique.map((pgWsId) => ({ rfpId, pgWsId })));
    }
  }

  async save(rfp: RFP, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    // bizProfile 은 옵셔널. 들어있으면 bizNo 로 가장 최근 row 매칭, 없으면 null.
    let bizProfileId: string | null = null;
    if (rfp.bizProfile?.bizNo) {
      const [biz] = await db
        .select()
        .from(bizProfiles)
        .where(eq(bizProfiles.bizNo, rfp.bizProfile.bizNo))
        .orderBy(sql`${bizProfiles.createdAt} desc`)
        .limit(1);
      if (!biz) {
        throw new Error(
          `BizProfile not found for bizNo=${rfp.bizProfile.bizNo} — call BizProfileRepo.save first`,
        );
      }
      bizProfileId = biz.id;
    }

    type Insertable = typeof rfps.$inferInsert;
    const values: Insertable = {
      id: rfp.id,
      code: rfp.code,
      buyerWsId: rfp.buyerWsId,
      bizProfileId,
      title: rfp.title,
      memo: rfp.memo,
      websiteUrl: rfp.websiteUrl ?? null,
      mainProducts: rfp.mainProducts ?? null,
      annualPgVolume: rfp.annualPgVolume ?? null,
      currentFeeRate: rfp.currentFeeRate ?? null,
      currentSettlementLimit: rfp.currentSettlementLimit ?? null,
      currentGuaranteeInsurance: rfp.currentGuaranteeInsurance ?? null,
      deadline: new Date(rfp.deadline),
      status: rfp.status,
      awardedBidId: rfp.awardedBidId ?? null,
      createdBy: rfp.createdBy,
      sentAt: rfp.sentAt ? new Date(rfp.sentAt) : null,
      contractType: rfp.contractType ?? null,
    };
    // boardVisible 미지정 시 DB default(true). 지정 시에만 반영하고, 업서트
    // conflict set 에는 넣지 않아 — 노출 토글은 전용 액션의 직접 UPDATE 소관이라
    // 일반 RFP 저장/수정이 구매사의 opt-out 선택을 덮어쓰지 않게 한다.
    if (rfp.boardVisible !== undefined) values.boardVisible = rfp.boardVisible;
    // currentFeeVisibleToPg 도 동일: 작성 시점 선택을 보존하기 위해 지정 시에만
    // 반영하고 conflict set 에는 넣지 않는다 (일반 저장/수정이 덮어쓰지 않게).
    if (rfp.currentFeeVisibleToPg !== undefined)
      values.currentFeeVisibleToPg = rfp.currentFeeVisibleToPg;

    await db
      .insert(rfps)
      .values(values)
      .onConflictDoUpdate({
        target: rfps.id,
        set: {
          title: rfp.title,
          memo: rfp.memo,
          websiteUrl: rfp.websiteUrl ?? null,
          mainProducts: rfp.mainProducts ?? null,
          annualPgVolume: rfp.annualPgVolume ?? null,
          currentFeeRate: rfp.currentFeeRate ?? null,
          currentSettlementLimit: rfp.currentSettlementLimit ?? null,
          currentGuaranteeInsurance: rfp.currentGuaranteeInsurance ?? null,
          deadline: new Date(rfp.deadline),
          status: rfp.status,
          awardedBidId: rfp.awardedBidId ?? null,
          sentAt: rfp.sentAt ? new Date(rfp.sentAt) : null,
          contractType: rfp.contractType ?? null,
        },
      });

    // Allowlist is normalized into rfp_allowed_pg (C2).
    await this.syncAllowlist(db, rfp.id, rfp.allowedPgWorkspaceIds);
  }

  async insertNew(values: NewRfpInsert, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(rfps).values({
      id: values.id,
      code: values.code,
      buyerWsId: values.buyerWsId,
      bizProfileId: values.bizProfileId,
      title: values.title,
      memo: values.memo,
      websiteUrl: values.websiteUrl,
      mainProducts: values.mainProducts,
      annualPgVolume: values.annualPgVolume,
      currentFeeRate: values.currentFeeRate,
      currentSettlementLimit: values.currentSettlementLimit,
      currentGuaranteeInsurance: values.currentGuaranteeInsurance,
      currentSettlementCycle: values.currentSettlementCycle,
      deliveryServicePeriod: values.deliveryServicePeriod,
      boardVisible: values.boardVisible,
      currentFeeVisibleToPg: values.currentFeeVisibleToPg,
      contractType: values.contractType,
      currentSolution: values.currentSolution,
      currentSolutionDetail: values.currentSolutionDetail,
      deadline: values.deadline,
      status: values.status,
      requiredPaymentMethods: values.requiredPaymentMethods,
      customPaymentMethods: values.customPaymentMethods,
      createdBy: values.createdBy,
      sentAt: values.sentAt,
      // 온보딩 샘플 전용 — 미지정 시 DB default(false).
      ...(values.isSample !== undefined ? { isSample: values.isSample } : {}),
    });
  }

  async deleteById(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    // 자식(bids·invitations·allowlist·attachments·team_messages)은 FK ON DELETE CASCADE.
    await db.delete(rfps).where(eq(rfps.id, id));
  }

  async findById(id: string, tx?: Tx): Promise<RFP | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ rfp: rfps, biz: bizProfiles })
      .from(rfps)
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(eq(rfps.id, id))
      .limit(1);
    if (!row) return undefined;
    const allowed = await this.allowedByRfp(db, [row.rfp.id]);
    return rowToRfp(row.rfp, row.biz, allowed.get(row.rfp.id) ?? []);
  }

  async findByCode(code: string, tx?: Tx): Promise<RFP | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ rfp: rfps, biz: bizProfiles })
      .from(rfps)
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(eq(rfps.code, code))
      .limit(1);
    if (!row) return undefined;
    const allowed = await this.allowedByRfp(db, [row.rfp.id]);
    return rowToRfp(row.rfp, row.biz, allowed.get(row.rfp.id) ?? []);
  }

  async findByBuyerWs(wsId: string, tx?: Tx): Promise<RFP[]> {
    const db = this.h(tx);
    const rows = await db
      .select({ rfp: rfps, biz: bizProfiles })
      .from(rfps)
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(eq(rfps.buyerWsId, wsId));
    const typed = rows as { rfp: RfpRow; biz: BizRow | null }[];
    const allowed = await this.allowedByRfp(
      db,
      typed.map((r) => r.rfp.id),
    );
    return typed.map((r) => rowToRfp(r.rfp, r.biz, allowed.get(r.rfp.id) ?? []));
  }

  async transition(
    id: string,
    to: RfpStatus,
    patch?: Partial<RFP>,
    tx?: Tx,
  ): Promise<RFP> {
    const db = this.h(tx);

    // Read current state to assert transition (action-layer parity).
    const [current] = await db
      .select({ status: rfps.status })
      .from(rfps)
      .where(eq(rfps.id, id))
      .limit(1);
    if (!current) throw new Error(`RFP not found: ${id}`);
    assertTransition(current.status, to);

    // Atomic update with `WHERE status=$prev` concurrency guard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setPatch: any = { status: to };
    if (patch?.awardedBidId !== undefined) setPatch.awardedBidId = patch.awardedBidId;
    if (patch?.sentAt !== undefined)
      setPatch.sentAt = patch.sentAt ? new Date(patch.sentAt) : null;
    if (patch?.title !== undefined) setPatch.title = patch.title;
    if (patch?.memo !== undefined) setPatch.memo = patch.memo;
    if (patch?.deadline !== undefined) setPatch.deadline = new Date(patch.deadline);

    const updated = await db
      .update(rfps)
      .set(setPatch)
      .where(and(eq(rfps.id, id), eq(rfps.status, current.status)))
      .returning();

    if (updated.length === 0) {
      throw new Error(`RFP transition lost a race for ${id}`);
    }

    if (patch?.allowedPgWorkspaceIds !== undefined) {
      await this.syncAllowlist(db, id, patch.allowedPgWorkspaceIds);
    }

    const after = await this.findById(id, tx);
    if (!after) throw new Error(`RFP disappeared after transition: ${id}`);
    return after;
  }

  async setBoardColumn(rfpId: string, columnId: string | null, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(rfps).set({ boardColumnId: columnId }).where(eq(rfps.id, rfpId));
  }

  async setBoardVisible(rfpId: string, visible: boolean, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(rfps).set({ boardVisible: visible }).where(eq(rfps.id, rfpId));
  }

  async updateDeadline(id: string, deadline: Date, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(rfps).set({ deadline }).where(eq(rfps.id, id));
  }

  async findIdAndOwnerByCode(
    code: string,
    tx?: Tx,
  ): Promise<{ id: string; buyerWsId: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ id: rfps.id, buyerWsId: rfps.buyerWsId })
      .from(rfps)
      .where(eq(rfps.code, code))
      .limit(1);
    return row ?? undefined;
  }

  async findOwnerById(id: string, tx?: Tx): Promise<{ buyerWsId: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ buyerWsId: rfps.buyerWsId })
      .from(rfps)
      .where(eq(rfps.id, id))
      .limit(1);
    return row ?? undefined;
  }

  async reserveNextCode(yearMonth: string, tx?: Tx): Promise<string> {
    const db = this.h(tx);
    // Atomic INSERT … ON CONFLICT DO UPDATE … RETURNING — folds the raw SQL in
    // lib/server/rfp-id.ts so the counter increment can share a tx with the RFP
    // insert. Output format mirrors nextRfpId byte-for-byte: `P-YYMM-NNNN`.
    const result = await db.execute(sql`
      INSERT INTO rfp_counters(year_month, last_seq) VALUES (${yearMonth}, 1)
      ON CONFLICT (year_month) DO UPDATE SET last_seq = rfp_counters.last_seq + 1
      RETURNING last_seq
    `);
    // postgres-js returns an array of rows; pglite returns `{ rows: [...] }`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    const rows: Array<{ last_seq: number }> = Array.isArray(r)
      ? (r as Array<{ last_seq: number }>)
      : (r?.rows ?? []);
    const seq = rows[0].last_seq;
    return `P-${yearMonth}-${String(seq).padStart(4, '0')}`;
  }

  async searchForBuyer(wsId: string, pattern: string, tx?: Tx): Promise<unknown[]> {
    const db = this.h(tx);
    // Whitelisted projection — mirrors searchEntitiesAction.ts (buyer RFP branch).
    // pattern is escape+wrapped by the caller (`%escaped%`).
    return db
      .select({
        code: rfps.code,
        title: rfps.title,
        memo: rfps.memo,
        status: rfps.status,
      })
      .from(rfps)
      .where(
        and(
          eq(rfps.buyerWsId, wsId),
          or(ilike(rfps.title, pattern), ilike(rfps.memo, pattern)),
        ),
      )
      .orderBy(desc(rfps.createdAt))
      .limit(20);
  }

  async listForBuyer(wsId: string, limit: number, tx?: Tx): Promise<unknown[]> {
    const db = this.h(tx);
    // 초성 검색 companion — searchForBuyer 와 동일한 화이트리스트 projection,
    // ilike 없이 ws-scope 만 fetch. 호출자가 getChoseong 로 JS 필터한다.
    return db
      .select({
        code: rfps.code,
        title: rfps.title,
        memo: rfps.memo,
        status: rfps.status,
      })
      .from(rfps)
      .where(eq(rfps.buyerWsId, wsId))
      .orderBy(desc(rfps.createdAt))
      .limit(limit);
  }
}
