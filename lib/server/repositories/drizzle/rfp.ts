import { and, eq, inArray, sql } from 'drizzle-orm';
import { rfps, bizProfiles, rfpAllowedPg } from '@/lib/db/schema';
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
    rfpFiles: [], // attachments hydrated separately when needed
    allowedPgWorkspaceIds: allowed,
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

    // shareToken 미지정 시 DB default(gen_random_uuid()::text)로 폴백.
    type Insertable = typeof rfps.$inferInsert;
    const values: Insertable = {
      id: rfp.id,
      code: rfp.code,
      buyerWsId: rfp.buyerWsId,
      bizProfileId,
      title: rfp.title,
      memo: rfp.memo,
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
          deadline: new Date(rfp.deadline),
          status: rfp.status,
          awardedBidId: rfp.awardedBidId ?? null,
          sentAt: rfp.sentAt ? new Date(rfp.sentAt) : null,
        },
      });

    // Allowlist is normalized into rfp_allowed_pg (C2).
    await this.syncAllowlist(db, rfp.id, rfp.allowedPgWorkspaceIds);
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

  async findByShareToken(token: string, tx?: Tx): Promise<RFP | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ rfp: rfps, biz: bizProfiles })
      .from(rfps)
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(eq(rfps.shareToken, token))
      .limit(1);
    if (!row) return undefined;
    const allowed = await this.allowedByRfp(db, [row.rfp.id]);
    return rowToRfp(row.rfp, row.biz, allowed.get(row.rfp.id) ?? []);
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
}
