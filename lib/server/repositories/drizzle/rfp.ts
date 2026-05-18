import { and, eq, sql } from 'drizzle-orm';
import { rfps, bizProfiles } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { RFP, RfpStatus } from '@/lib/types/rfp';
import type { BizProfile } from '@/lib/types/biz-profile';
import { assertTransition } from '../../rfp-state';
import type { RfpRepo, Tx } from '../types';

type RfpRow = typeof rfps.$inferSelect;
type BizRow = typeof bizProfiles.$inferSelect;

function toIso(d: Date | null | undefined): string | undefined {
  return d ? new Date(d).toISOString() : undefined;
}

function rowToRfp(row: RfpRow, biz: BizRow | null): RFP {
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
    buyerWsId: row.buyerWsId,
    bizProfile: profile,
    title: row.title,
    memo: row.memo,
    rfpFiles: [], // attachments hydrated separately when needed
    allowedPgWorkspaceIds: row.allowedPgWorkspaceIds ?? [],
    deadline: new Date(row.deadline).toISOString(),
    status: row.status,
    awardedBidId: row.awardedBidId ?? undefined,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    sentAt: toIso(row.sentAt),
    shareToken: row.shareToken,
  };
}

export class DrizzleRfpRepository implements RfpRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
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

    // shareToken 미지정 시 DB default(gen_random_uuid()::text)로 폴백 — 호출자가
    // generateToken()으로 명시 지정해도 되고, 자동 생성도 안전.
    type Insertable = typeof rfps.$inferInsert;
    const values: Insertable = {
      id: rfp.id,
      buyerWsId: rfp.buyerWsId,
      bizProfileId,
      title: rfp.title,
      memo: rfp.memo,
      allowedPgWorkspaceIds: rfp.allowedPgWorkspaceIds,
      deadline: new Date(rfp.deadline),
      status: rfp.status,
      awardedBidId: rfp.awardedBidId ?? null,
      createdBy: rfp.createdBy,
      sentAt: rfp.sentAt ? new Date(rfp.sentAt) : null,
    };
    if (rfp.shareToken) values.shareToken = rfp.shareToken;

    await db
      .insert(rfps)
      .values(values)
      .onConflictDoUpdate({
        target: rfps.id,
        set: {
          title: rfp.title,
          memo: rfp.memo,
          allowedPgWorkspaceIds: rfp.allowedPgWorkspaceIds,
          deadline: new Date(rfp.deadline),
          status: rfp.status,
          awardedBidId: rfp.awardedBidId ?? null,
          sentAt: rfp.sentAt ? new Date(rfp.sentAt) : null,
        },
      });
  }

  async findById(id: string, tx?: Tx): Promise<RFP | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ rfp: rfps, biz: bizProfiles })
      .from(rfps)
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(eq(rfps.id, id))
      .limit(1);
    return row ? rowToRfp(row.rfp, row.biz) : undefined;
  }

  async findByBuyerWs(wsId: string, tx?: Tx): Promise<RFP[]> {
    const db = this.h(tx);
    const rows = await db
      .select({ rfp: rfps, biz: bizProfiles })
      .from(rfps)
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(eq(rfps.buyerWsId, wsId));
    return rows.map((r: { rfp: RfpRow; biz: BizRow | null }) =>
      rowToRfp(r.rfp, r.biz),
    );
  }

  async findByShareToken(token: string, tx?: Tx): Promise<RFP | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ rfp: rfps, biz: bizProfiles })
      .from(rfps)
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(eq(rfps.shareToken, token))
      .limit(1);
    return row ? rowToRfp(row.rfp, row.biz) : undefined;
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
    if (patch?.allowedPgWorkspaceIds !== undefined)
      setPatch.allowedPgWorkspaceIds = patch.allowedPgWorkspaceIds;
    if (patch?.deadline !== undefined) setPatch.deadline = new Date(patch.deadline);

    const updated = await db
      .update(rfps)
      .set(setPatch)
      .where(and(eq(rfps.id, id), eq(rfps.status, current.status)))
      .returning();

    if (updated.length === 0) {
      throw new Error(`RFP transition lost a race for ${id}`);
    }

    const after = await this.findById(id, tx);
    if (!after) throw new Error(`RFP disappeared after transition: ${id}`);
    return after;
  }
}
