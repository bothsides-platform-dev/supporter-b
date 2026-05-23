import { and, eq, exists, gt, inArray, isNull, sql } from 'drizzle-orm';
import { rfpInvitations, rfps, bizProfiles } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { RfpInvitation, InvitationStatus } from '@/lib/types/invitation';
import type { RFP } from '@/lib/types/rfp';
import type { BizProfile } from '@/lib/types/biz-profile';
import { hashToken } from '../../token';
import type { InvitationRepo, TokenClaimResult, Tx } from '../types';

type InvRow = typeof rfpInvitations.$inferSelect;
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
    code: row.code,
    buyerWsId: row.buyerWsId,
    bizProfile: profile,
    title: row.title,
    memo: row.memo,
    rfpFiles: [],
    // PG-side view (findByPgWorkspace) never exposes the allowlist by design.
    allowedPgWorkspaceIds: [],
    deadline: new Date(row.deadline).toISOString(),
    status: row.status,
    awardedBidId: row.awardedBidId ?? undefined,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    sentAt: toIso(row.sentAt),
  };
}

// DB enum is a subset of UI InvitationStatus — collapse 'declined' (UI-only) to
// the closest persisted value when encountered (defensive).
function dbStatusToUi(s: InvRow['status']): InvitationStatus {
  if (s === 'pending') return 'sent';
  if (s === 'draft') return 'draft';
  return s as InvitationStatus;
}

// UI status → DB enum. 'sent'/'declined' fold into 'pending'/'expired'
// respectively for the persisted projection.
function uiStatusToDb(s: InvitationStatus): InvRow['status'] {
  switch (s) {
    case 'draft':
      return 'draft';
    case 'sent':
      return 'pending';
    case 'opened':
      return 'opened';
    case 'accepted':
      return 'accepted';
    case 'declined':
    case 'expired':
      return 'expired';
  }
}

function rowToInvitation(row: InvRow): RfpInvitation {
  return {
    id: row.id,
    rfpId: row.rfpId,
    pgWsId: row.pgWsId,
    acceptedByUserId: row.acceptedByUserId ?? undefined,
    // Raw token never leaves the DB — return placeholder. Callers must not
    // rely on `uniqueToken` post-retrieval; it exists for construction only.
    uniqueToken: '',
    sentAt: new Date(row.sentAt).toISOString(),
    openedAt: row.openedAt ? new Date(row.openedAt).toISOString() : undefined,
    expiresAt: new Date(row.expiresAt).toISOString(),
    status: dbStatusToUi(row.status),
    boardColumnId: row.boardColumnId,
  };
}

export class DrizzleInvitationRepository implements InvitationRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(inv: RfpInvitation, rawToken: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(rfpInvitations)
      .values({
        id: inv.id,
        rfpId: inv.rfpId,
        pgWsId: inv.pgWsId,
        acceptedByUserId: inv.acceptedByUserId ?? null,
        tokenHash: hashToken(rawToken),
        sentAt: new Date(inv.sentAt),
        openedAt: inv.openedAt ? new Date(inv.openedAt) : null,
        expiresAt: new Date(inv.expiresAt),
        status: uiStatusToDb(inv.status),
      })
      .onConflictDoUpdate({
        target: rfpInvitations.id,
        set: {
          pgWsId: inv.pgWsId,
          acceptedByUserId: inv.acceptedByUserId ?? null,
          openedAt: inv.openedAt ? new Date(inv.openedAt) : null,
          status: uiStatusToDb(inv.status),
        },
      });
  }

  async findById(id: string, tx?: Tx): Promise<RfpInvitation | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.id, id))
      .limit(1);
    return row ? rowToInvitation(row) : undefined;
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<RfpInvitation[]> {
    const db = this.h(tx);
    const rows = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.rfpId, rfpId));
    return rows.map(rowToInvitation);
  }

  // 배치 조회 — 여러 RFP의 invitation을 rfpId별로 그룹화(buyer 칸반 N+1 제거). 1 쿼리.
  async findByRfpIds(
    rfpIds: string[],
    tx?: Tx,
  ): Promise<Map<string, RfpInvitation[]>> {
    const db = this.h(tx);
    const map = new Map<string, RfpInvitation[]>();
    if (rfpIds.length === 0) return map;
    const rows = (await db
      .select()
      .from(rfpInvitations)
      .where(inArray(rfpInvitations.rfpId, rfpIds))) as InvRow[];
    for (const row of rows) {
      const inv = rowToInvitation(row);
      const list = map.get(inv.rfpId) ?? [];
      list.push(inv);
      map.set(inv.rfpId, list);
    }
    return map;
  }

  async findDraftsByRfp(rfpId: string, tx?: Tx): Promise<RfpInvitation[]> {
    const db = this.h(tx);
    const rows = await db
      .select()
      .from(rfpInvitations)
      .where(
        and(
          eq(rfpInvitations.rfpId, rfpId),
          eq(rfpInvitations.status, 'draft'),
        ),
      );
    return rows.map(rowToInvitation);
  }

  async findByTokenHash(
    tokenHash: string,
    tx?: Tx,
  ): Promise<RfpInvitation | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.tokenHash, tokenHash))
      .limit(1);
    return row ? rowToInvitation(row) : undefined;
  }

  async findByPgWorkspace(
    pgWsId: string,
    tx?: Tx,
  ): Promise<{ invitation: RfpInvitation; rfp: RFP }[]> {
    const db = this.h(tx);
    const rows = (await db
      .select({ inv: rfpInvitations, rfp: rfps, biz: bizProfiles })
      .from(rfpInvitations)
      .innerJoin(rfps, eq(rfpInvitations.rfpId, rfps.id))
      .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
      .where(
        and(
          eq(rfpInvitations.pgWsId, pgWsId),
          inArray(rfpInvitations.status, ['pending', 'opened', 'accepted']),
        ),
      )) as { inv: InvRow; rfp: RfpRow; biz: BizRow | null }[];
    return rows.map((r) => ({
      invitation: rowToInvitation(r.inv),
      rfp: rowToRfp(r.rfp, r.biz),
    }));
  }

  async claimToken(
    rawToken: string,
    userId: string,
    tx?: Tx,
  ): Promise<TokenClaimResult> {
    const db = this.h(tx);
    const tokenHash = hashToken(rawToken);

    // Atomic: only succeed if token matches AND not yet accepted AND not expired.
    const updated = await db
      .update(rfpInvitations)
      .set({ acceptedByUserId: userId, status: 'accepted' })
      .where(
        and(
          eq(rfpInvitations.tokenHash, tokenHash),
          isNull(rfpInvitations.acceptedByUserId),
          gt(rfpInvitations.expiresAt, sql`now()`),
        ),
      )
      .returning();

    if (updated.length > 0) {
      return { ok: true, invitation: rowToInvitation(updated[0]) };
    }

    // Re-read to determine the failure reason (DB is source of truth).
    const [row] = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.tokenHash, tokenHash))
      .limit(1);
    if (!row) return { ok: false, reason: 'invalid' };
    if (row.acceptedByUserId) return { ok: false, reason: 'used' };
    return { ok: false, reason: 'expired' };
  }

  async markOpened(
    invitationId: string,
    openedAt: Date,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    // pending(미클레임) 또는 accepted(클레임 완료) → opened. opened/expired/draft 는 no-op.
    // 워크스페이스 멤버 누구라도 detail 페이지 첫 진입 시 검토 시작 시그널이 됨.
    await db
      .update(rfpInvitations)
      .set({ status: 'opened', openedAt })
      .where(
        and(
          eq(rfpInvitations.id, invitationId),
          inArray(rfpInvitations.status, ['pending', 'accepted']),
        ),
      );
  }

  async canAccess(rfpId: string, pgWsId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const [row] = await db
      .select({
        ok: exists(
          db
            .select({ one: sql`1` })
            .from(rfpInvitations)
            .where(
              and(
                eq(rfpInvitations.rfpId, rfpId),
                eq(rfpInvitations.pgWsId, pgWsId),
                inArray(rfpInvitations.status, ['pending', 'opened', 'accepted']),
              ),
            ),
        ).as('ok'),
      })
      .from(sql`(select 1) as _dummy`);
    return Boolean(row?.ok);
  }

  async setBoardColumn(
    invitationId: string,
    columnId: string | null,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(rfpInvitations)
      .set({ boardColumnId: columnId })
      .where(eq(rfpInvitations.id, invitationId));
  }
}
