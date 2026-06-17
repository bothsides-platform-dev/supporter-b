import { randomUUID } from 'node:crypto';

import type {
  AttachmentRepo,
  AuditLogRepo,
  BidRepo,
  BizProfileRepo,
  ContractRepo,
  InvitationRepo,
  OutboxRepo,
  PgRequestRepo,
  RfpAllowedPgRepo,
  RfpRepo,
  RfpRequoteRequestRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderRfpAwarded } from '@/lib/server/outbox/templates/rfpAwarded';
import { renderRfpInvited } from '@/lib/server/outbox/templates/rfpInvited';
import { renderRfpRequoteRequested } from '@/lib/server/outbox/templates/rfpRequoteRequested';
import { isUniqueViolation } from '@/lib/server/repositories/utils';
import { baseUrlFor } from '@/lib/server/env';
import { nextRfpId } from '@/lib/server/rfp-id';
import { addMinutes, generateToken } from '@/lib/server/token';
import type { MerchantGrade } from '@/lib/types/biz-profile';
import type { Notification } from '@/lib/types/notification';
import type { Actor, ServiceResult } from './types';

export type { Actor, ServiceResult };

const INVITE_TTL_DAYS = 7;
const ALLOWED_PG_WORKSPACES_MAX = 50;

export type CreateRfpServiceInput = {
  title: string;
  memo?: string;
  deadline: Date;
  allowedPgWorkspaceIds: string[];
  rfpAttachmentIds?: string[];
  requiredPaymentMethods: string[];
  customPaymentMethods: { id?: string; label: string }[];
  send: boolean;
  boardVisible: boolean;
  currentFeeVisibleToPg: boolean;
  contractType?: 'new' | 'renewal' | null;
  bizProfileMode: 'inherit' | 'override' | 'none';
  bizNoOverride?: string;
  gradeOverride?: string;
  websiteUrl?: string;
  mainProducts?: string;
  annualPgVolume?: string;
  currentFeeRate?: string;
  currentSettlementLimit?: string;
  currentGuaranteeInsurance?: string;
  currentSettlementCycle?: string;
  deliveryServicePeriod?: string;
  currentSolution?: string;
  currentSolutionDetail?: string;
};

export class RfpService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly rfpRepo: RfpRepo,
    private readonly contractRepo: ContractRepo,
    private readonly outboxRepo: OutboxRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly bidRepo: BidRepo,
    private readonly invitationRepo: InvitationRepo,
    private readonly pgRequestRepo: PgRequestRepo,
    private readonly bizProfileRepo: BizProfileRepo,
    private readonly requoteRepo: RfpRequoteRequestRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly rfpAllowedPgRepo: RfpAllowedPgRepo,
    private readonly attachmentRepo: AttachmentRepo,
  ) {}

  async award(
    rfpId: string,
    awardedBidId: string,
    actor: Actor,
  ): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const rfp = await this.rfpRepo.findById(rfpId, tx);
      if (!rfp) return { ok: false as const, error: 'RFP_NOT_FOUND' };
      if (rfp.buyerWsId !== actor.workspaceId) {
        return { ok: false as const, error: 'FORBIDDEN_BUYER' };
      }
      // 온보딩 샘플은 읽기전용 샌드박스 — 서버에서도 선정을 막는다(UI 게이트 보강).
      if (rfp.isSample) return { ok: false as const, error: 'SAMPLE_READONLY' };

      // Validate winner exists before transitioning to avoid FK violation.
      const allBids = await this.bidRepo.findByRfp(rfpId, tx);
      const submitted = allBids.filter((b) => b.status === 'submitted');
      const winner = submitted.find((b) => b.id === awardedBidId);
      if (!winner) return { ok: false as const, error: 'WINNING_BID_NOT_FOUND' };
      const losers = submitted.filter((b) => b.id !== awardedBidId);

      try {
        await this.rfpRepo.transition(rfpId, 'awarded', { awardedBidId }, tx);
      } catch (e) {
        return {
          ok: false as const,
          error: `INVALID_TRANSITION: ${(e as Error).message}`,
        };
      }

      await this.contractRepo.save(
        {
          id: randomUUID(),
          rfpId,
          bidId: awardedBidId,
          awardedAt: new Date().toISOString(),
          awardedBy: actor.userId,
        },
        tx,
      );

      // 감사 로그 (C5) — 선정과 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'rfp.award',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { bidId: awardedBidId, pgWsId: winner.pgWsId, title: rfp.title },
        },
        tx,
      );

      const rfpCode = rfp.code;

      // Batch-fetch member IDs for winner + all losers in a single IN-query.
      const allPgWsIds = [winner.pgWsId, ...losers.map((l) => l.pgWsId)];
      const memberIdsMap = await this.workspaceRepo.memberUserIdsBatch(allPgWsIds, tx);

      // winner: in-app + email per member
      const winnerUserIds = memberIdsMap.get(winner.pgWsId) ?? [];
      for (const userId of winnerUserIds) {
        const notif: Notification = {
          id: randomUUID(),
          userId,
          workspaceId: winner.pgWsId,
          type: 'rfp.awarded',
          title: `[${rfpCode}] 선정됐어요`,
          body: '보내신 견적이 최종 선정됐어요.',
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/inbox/${rfpCode}`,
          createdAt: new Date().toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      const winnerEmails = await this.workspaceRepo.memberEmails(winner.pgWsId, tx);
      const awardedHtml = await renderRfpAwarded({
        rfpId: rfpCode,
        rfpTitle: rfp.title,
        bidId: awardedBidId,
        settlementCycle: winner.settleCycle,
      });
      for (const email of winnerEmails) {
        await this.outboxRepo.enqueue(
          {
            event: 'rfp.awarded',
            to: email,
            subject: `[Supporter B · ${rfpCode}] 선정 결과`,
            html: awardedHtml,
            dedupeKey: `rfp:${rfpId}:awarded:${email}`,
          },
          tx,
        );
      }

      // losers: in-app only
      for (const loser of losers) {
        const loserUserIds = memberIdsMap.get(loser.pgWsId) ?? [];
        for (const userId of loserUserIds) {
          const notif: Notification = {
            id: randomUUID(),
            userId,
            workspaceId: loser.pgWsId,
            type: 'rfp.rejected',
            title: `[${rfpCode}] 이번엔 선정되지 않았어요`,
            body: '다른 PG가 선정됐어요.',
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfpCode}`,
            createdAt: new Date().toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }
      }

      return { ok: true as const };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  async cancel(rfpId: string, actor: Actor): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const rfp = await this.rfpRepo.findById(rfpId, tx);
      if (!rfp) return { ok: false as const, error: 'RFP_NOT_FOUND' };
      if (rfp.buyerWsId !== actor.workspaceId) {
        return { ok: false as const, error: 'FORBIDDEN_BUYER' };
      }

      try {
        await this.rfpRepo.transition(rfpId, 'cancelled', undefined, tx);
      } catch (e) {
        return {
          ok: false as const,
          error: `INVALID_TRANSITION: ${(e as Error).message}`,
        };
      }

      // 감사 로그 (C5) — 취소와 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'rfp.cancel',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { title: rfp.title },
        },
        tx,
      );

      const rfpCode = rfp.code;
      const allBids = await this.bidRepo.findByRfp(rfpId, tx);
      const submittedPgWsIds = [
        ...new Set(
          allBids.filter((b) => b.status === 'submitted').map((b) => b.pgWsId),
        ),
      ];

      const cancelMemberMap = await this.workspaceRepo.memberUserIdsBatch(submittedPgWsIds, tx);
      for (const pgWsId of submittedPgWsIds) {
        const memberIds = cancelMemberMap.get(pgWsId) ?? [];
        for (const userId of memberIds) {
          const notif: Notification = {
            id: randomUUID(),
            userId,
            workspaceId: pgWsId,
            type: 'rfp.cancelled',
            title: `[${rfpCode}] 취소됨`,
            body: '구매사가 견적 요청을 취소했어요.',
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfpCode}`,
            createdAt: new Date().toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }
      }

      return { ok: true as const };
    });

    // No flushAfterCommit here — cancel enqueues no outbox entries.
    if (result.ok) emitAfterCommit(pendingEmits);
    return result;
  }

  async close(rfpId: string, actor: Actor): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const rfp = await this.rfpRepo.findById(rfpId, tx);
      if (!rfp) return { ok: false as const, error: 'RFP_NOT_FOUND' };
      if (rfp.buyerWsId !== actor.workspaceId) {
        return { ok: false as const, error: 'FORBIDDEN_BUYER' };
      }

      try {
        await this.rfpRepo.transition(rfpId, 'closed', undefined, tx);
      } catch (e) {
        return {
          ok: false as const,
          error: `INVALID_TRANSITION: ${(e as Error).message}`,
        };
      }

      // 감사 로그 (C5) — 마감과 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'rfp.close',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { title: rfp.title },
        },
        tx,
      );

      const rfpCode = rfp.code;
      const allBids = await this.bidRepo.findByRfp(rfpId, tx);
      const submittedPgWsIds = [
        ...new Set(
          allBids.filter((b) => b.status === 'submitted').map((b) => b.pgWsId),
        ),
      ];

      const closeMemberMap = await this.workspaceRepo.memberUserIdsBatch(submittedPgWsIds, tx);
      for (const pgWsId of submittedPgWsIds) {
        const memberIds = closeMemberMap.get(pgWsId) ?? [];
        for (const userId of memberIds) {
          const notif: Notification = {
            id: randomUUID(),
            userId,
            workspaceId: pgWsId,
            type: 'rfp.closed',
            title: `[${rfpCode}] 마감됨`,
            body: '구매사가 견적 요청을 마감했어요.',
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfpCode}`,
            createdAt: new Date().toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }
      }

      return { ok: true as const };
    });

    // No flushAfterCommit here — close enqueues no outbox entries.
    if (result.ok) emitAfterCommit(pendingEmits);
    return result;
  }

  async rejectPgRequest(requestId: string, actor: Actor): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const req = await this.pgRequestRepo.findById(requestId, tx);
      if (!req) return { ok: false as const, error: 'NOT_FOUND' };
      if (req.status !== 'pending') return { ok: false as const, error: 'NOT_PENDING' };

      const rfpRow = await this.rfpRepo.findById(req.rfpId, tx);
      if (!rfpRow) return { ok: false as const, error: 'NOT_FOUND' };
      if (rfpRow.buyerWsId !== actor.workspaceId) return { ok: false as const, error: 'NOT_OWNED' };

      await this.pgRequestRepo.markDecided(req.id, 'rejected', actor.userId, now, tx);

      const pgMemberIds = await this.workspaceRepo.memberUserIds(req.pgWsId, tx);
      for (const userId of pgMemberIds) {
        const notif: Notification = {
          id: randomUUID(),
          userId,
          workspaceId: req.pgWsId,
          type: 'pg.request.rejected',
          title: `[${rfpRow.code}] 참여 요청 마감`,
          body: '아쉽지만 이번 RFP에는 참여가 어려워요.',
          channel: 'inapp',
          status: 'pending',
          createdAt: now.toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      return { ok: true as const };
    });

    if (result.ok) emitAfterCommit(pendingEmits);
    return result;
  }

  async createPgRequest(rfpCode: string, message: string, actor: Actor): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const rfpRow = await this.rfpRepo.findByCode(rfpCode, tx);
      if (!rfpRow || !rfpRow.boardVisible) return { ok: false as const, error: 'NOT_FOUND' };
      if (rfpRow.status !== 'sent') return { ok: false as const, error: 'RFP_NOT_OPEN' };
      if (new Date(rfpRow.deadline).getTime() <= now.getTime()) {
        return { ok: false as const, error: 'RFP_DEADLINE_PASSED' };
      }

      if (await this.rfpAllowedPgRepo.has(rfpRow.id, actor.workspaceId, tx)) {
        return { ok: false as const, error: 'ALREADY_PARTICIPATING' };
      }

      if (await this.pgRequestRepo.findPairStatus(rfpRow.id, actor.workspaceId, tx)) {
        return { ok: false as const, error: 'ALREADY_REQUESTED' };
      }

      try {
        await this.pgRequestRepo.create(
          {
            id: randomUUID(),
            rfpId: rfpRow.id,
            pgWsId: actor.workspaceId,
            message,
            status: 'pending',
            createdByUserId: actor.userId,
            createdAt: now.toISOString(),
          },
          tx,
        );
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false as const, error: 'ALREADY_REQUESTED' };
        throw err;
      }

      const pgWsName = (await this.workspaceRepo.getName(actor.workspaceId, tx)) ?? 'PG사';

      const buyerMemberIds = await this.workspaceRepo.memberUserIds(rfpRow.buyerWsId, tx);
      for (const userId of buyerMemberIds) {
        const notif: Notification = {
          id: randomUUID(),
          userId,
          workspaceId: rfpRow.buyerWsId,
          type: 'pg.request.received',
          title: `[${rfpCode}] 새 참여 요청`,
          body: `${pgWsName}가 이 견적 요청에 참여를 요청했어요.`,
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/rfp/${rfpCode}`,
          createdAt: now.toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      return { ok: true as const };
    });

    if (result.ok) emitAfterCommit(pendingEmits);
    return result;
  }

  async acceptPgRequest(requestId: string, actor: Actor): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const req = await this.pgRequestRepo.findById(requestId, tx);
      if (!req) return { ok: false as const, error: 'NOT_FOUND' };
      if (req.status !== 'pending') return { ok: false as const, error: 'NOT_PENDING' };

      const rfpRow = await this.rfpRepo.findById(req.rfpId, tx);
      if (!rfpRow) return { ok: false as const, error: 'NOT_FOUND' };
      if (rfpRow.buyerWsId !== actor.workspaceId) return { ok: false as const, error: 'NOT_OWNED' };
      if (rfpRow.status !== 'sent') return { ok: false as const, error: 'RFP_NOT_OPEN' };
      if (new Date(rfpRow.deadline).getTime() <= now.getTime()) {
        return { ok: false as const, error: 'RFP_DEADLINE_PASSED' };
      }

      const buyerName = (await this.workspaceRepo.getName(rfpRow.buyerWsId, tx)) ?? '구매사';

      await this.rfpAllowedPgRepo.add(req.rfpId, [req.pgWsId], tx);

      const existingInv = await this.invitationRepo.findByRfpAndPg(req.rfpId, req.pgWsId, tx);
      const needsInvite = !existingInv || existingInv.status === 'draft';
      if (needsInvite) {
        const rawToken = generateToken();
        if (existingInv) {
          await this.invitationRepo.promoteDraft(
            existingInv.id,
            rawToken,
            now,
            new Date(rfpRow.deadline),
            tx,
          );
        } else {
          await this.invitationRepo.save(
            {
              id: randomUUID(),
              rfpId: req.rfpId,
              pgWsId: req.pgWsId,
              uniqueToken: '',
              sentAt: now.toISOString(),
              expiresAt: new Date(rfpRow.deadline).toISOString(),
              status: 'sent',
            },
            rawToken,
            tx,
          );
        }

        const deadlineDisplay = new Date(rfpRow.deadline)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 16);
        const adminRows = await this.workspaceRepo.adminRecipients(req.pgWsId, tx);
        for (const admin of adminRows) {
          const inviteUrl = `${baseUrlFor('pg')}/invite/rfp/${rawToken}`;
          const html = await renderRfpInvited({
            rfpId: rfpRow.code,
            rfpTitle: rfpRow.title,
            buyerName,
            deadline: deadlineDisplay,
            inviteUrl,
          });
          await this.outboxRepo.enqueue(
            {
              event: 'rfp.invited',
              to: admin.email,
              subject: `[Supporter B · ${rfpRow.code}] 견적 요청이 도착했어요`,
              html,
              dedupeKey: `rfp:${req.rfpId}:invite:ws:${req.pgWsId}:user:${admin.userId}`,
            },
            tx,
          );
        }
      }

      const pgMemberIds = await this.workspaceRepo.memberUserIds(req.pgWsId, tx);
      for (const userId of pgMemberIds) {
        const notif: Notification = {
          id: randomUUID(),
          userId,
          workspaceId: req.pgWsId,
          type: 'pg.request.accepted',
          title: `[${rfpRow.code}] 참여 요청 수락됨`,
          body: `${buyerName}가 참여 요청을 수락했어요. 이제 견적을 보낼 수 있어요.`,
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/inbox/${rfpRow.code}`,
          createdAt: now.toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      await this.pgRequestRepo.markDecided(req.id, 'accepted', actor.userId, now, tx);
      return { ok: true as const };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  async addPgWorkspaces(
    rfpCode: string,
    pgWsIds: string[],
    actor: Actor,
  ): Promise<ServiceResult<{ addedCount: number; skipped: string[] }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult<{ addedCount: number; skipped: string[] }> = await this._db.transaction(async (tx: any) => {
      const row = await this.rfpRepo.findByCode(rfpCode, tx);
      if (!row) return { ok: false as const, error: 'NOT_FOUND' };

      const currentAllowed = await this.rfpAllowedPgRepo.listPgWsIds(row.id, tx);

      if (row.buyerWsId !== actor.workspaceId) return { ok: false as const, error: 'NOT_OWNED' };
      if (row.status !== 'sent') return { ok: false as const, error: 'RFP_NOT_OPEN' };
      if (new Date(row.deadline).getTime() <= Date.now()) {
        return { ok: false as const, error: 'RFP_DEADLINE_PASSED' };
      }

      const confirmedPgIds = await this.workspaceRepo.filterPgIds(pgWsIds, tx);
      const confirmedPgSet = new Set(confirmedPgIds.map((id) => id.toLowerCase()));
      const hasInvalid = pgWsIds.some((id) => !confirmedPgSet.has(id.toLowerCase()));
      if (hasInvalid) return { ok: false as const, error: 'INVALID_WORKSPACE' };

      const existing = new Set(currentAllowed.map((id: string) => id.toLowerCase()));
      const seenInBatch = new Set<string>();
      const toAdd: string[] = [];
      const skipped: string[] = [];
      for (const raw of pgWsIds) {
        const norm = raw.toLowerCase();
        if (existing.has(norm) || seenInBatch.has(norm)) {
          skipped.push(raw);
          continue;
        }
        seenInBatch.add(norm);
        toAdd.push(norm);
      }

      if (toAdd.length === 0) return { ok: true as const, addedCount: 0, skipped };

      const totalAfter = currentAllowed.length + toAdd.length;
      if (totalAfter > ALLOWED_PG_WORKSPACES_MAX) {
        return { ok: false as const, error: 'WORKSPACES_LIMIT_EXCEEDED' };
      }

      await this.rfpAllowedPgRepo.add(row.id, toAdd, tx);

      const expiresAt = new Date(row.deadline);
      for (const workspaceId of toAdd) {
        await this.invitationRepo.saveDraft(randomUUID(), row.id, workspaceId, expiresAt, tx);
      }

      return { ok: true as const, addedCount: toAdd.length, skipped };
    });

    return result;
  }

  async sendDraftInvitations(
    rfpCode: string,
    actor: Actor,
  ): Promise<ServiceResult<{ sentCount: number }>> {
    const pendingEmits: Notification[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult<{ sentCount: number }> = await this._db.transaction(async (tx: any) => {
      const rfpRow = await this.rfpRepo.findByCode(rfpCode, tx);
      if (!rfpRow) return { ok: false as const, error: 'NOT_FOUND' };
      if (rfpRow.buyerWsId !== actor.workspaceId) return { ok: false as const, error: 'NOT_OWNED' };
      if (rfpRow.status !== 'sent') return { ok: false as const, error: 'RFP_NOT_OPEN' };
      if (new Date(rfpRow.deadline).getTime() <= Date.now()) {
        return { ok: false as const, error: 'RFP_DEADLINE_PASSED' };
      }

      const drafts = await this.invitationRepo.findDraftsByRfp(rfpRow.id, tx);
      if (drafts.length === 0) return { ok: true as const, sentCount: 0 };

      const buyerName = (await this.workspaceRepo.getName(actor.workspaceId, tx)) ?? '구매사';
      const deadlineDisplay = new Date(rfpRow.deadline)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 16);

      const uniquePgWsIds = Array.from(new Set(drafts.map((d) => d.pgWsId)));
      const allMembers = await this.workspaceRepo.memberRecipientsBatch(uniquePgWsIds, tx);

      const membersByWs = new Map<string, typeof allMembers>();
      for (const m of allMembers) {
        const list = membersByWs.get(m.workspaceId) ?? [];
        list.push(m);
        membersByWs.set(m.workspaceId, list);
      }

      for (const pgWsId of uniquePgWsIds) {
        const members = membersByWs.get(pgWsId) ?? [];
        for (const m of members) {
          const notif: Notification = {
            id: randomUUID(),
            userId: m.userId,
            workspaceId: pgWsId,
            type: 'rfp.invited',
            title: `[${rfpCode}] 견적 요청이 도착했어요`,
            body: `${buyerName}가 견적을 요청했어요.`,
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfpCode}`,
            createdAt: new Date().toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }
      }

      const now = new Date();
      const expiresAt = new Date(rfpRow.deadline);
      let sentCount = 0;
      for (const draft of drafts) {
        const rawToken = generateToken();
        await this.invitationRepo.promoteDraft(draft.id, rawToken, now, expiresAt, tx);

        const inviteUrl = `${baseUrlFor('pg')}/invite/rfp/${rawToken}`;
        const html = await renderRfpInvited({
          rfpId: rfpCode,
          rfpTitle: rfpRow.title,
          buyerName,
          deadline: deadlineDisplay,
          inviteUrl,
        });

        const wsMembers = membersByWs.get(draft.pgWsId) ?? [];
        const admins = wsMembers.filter((m) => m.role === 'admin');
        for (const admin of admins) {
          await this.outboxRepo.enqueue(
            {
              event: 'rfp.invited',
              to: admin.email,
              subject: `[Supporter B · ${rfpCode}] 견적 요청이 도착했어요`,
              html,
              dedupeKey: `rfp:${rfpRow.id}:invite:ws:${draft.pgWsId}:user:${admin.userId}`,
            },
            tx,
          );
        }
        sentCount += 1;
      }

      // 감사 로그 (C5) — 발송과 같은 트랜잭션에서 커밋 (no-op 0건은 위에서 조기 반환).
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'rfp.send_invitations',
          entityType: 'rfp',
          entityId: rfpCode,
          metadata: { sentCount },
        },
        tx,
      );

      return { ok: true as const, sentCount };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  async requote(
    rfpId: string,
    input: { targetPgWsIds: string[]; message: string; newDeadline: Date },
    actor: Actor,
  ): Promise<ServiceResult> {
    if (input.targetPgWsIds.length === 0) {
      return { ok: false, error: 'NO_TARGETS' };
    }
    if (input.message.trim().length === 0) {
      return { ok: false, error: 'MESSAGE_REQUIRED' };
    }
    if (input.newDeadline.getTime() <= Date.now()) {
      return { ok: false, error: 'DEADLINE_IN_PAST' };
    }

    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const rfp = await this.rfpRepo.findById(rfpId, tx);
      if (!rfp) return { ok: false as const, error: 'RFP_NOT_FOUND' };
      if (rfp.buyerWsId !== actor.workspaceId) return { ok: false as const, error: 'FORBIDDEN_BUYER' };
      if (rfp.status !== 'sent') return { ok: false as const, error: 'RFP_NOT_OPEN' };

      const allBids = await this.bidRepo.findByRfp(rfpId, tx);
      const now = new Date();

      // 1) 전 대상 검증 — 하나라도 실패하면 all-or-nothing 롤백.
      const plans: { pgWsId: string; round: number }[] = [];
      for (const pgWsId of input.targetPgWsIds) {
        const theirSubmitted = allBids.filter((b) => b.pgWsId === pgWsId && b.status === 'submitted');
        if (theirSubmitted.length === 0) {
          return { ok: false as const, error: 'TARGET_NOT_BIDDER' };
        }
        const existingPending = await this.requoteRepo.findPendingByPair(rfpId, pgWsId, tx);
        if (existingPending) return { ok: false as const, error: 'REQUOTE_ALREADY_PENDING' };
        const maxRound = theirSubmitted.reduce((m, b) => Math.max(m, b.round), 0);
        plans.push({ pgWsId, round: maxRound + 1 });
      }

      // 2) 레코드 생성 + 마감 갱신.
      for (const p of plans) {
        await this.requoteRepo.create(
          {
            id: randomUUID(),
            rfpId,
            pgWsId: p.pgWsId,
            round: p.round,
            message: input.message,
            deadline: input.newDeadline.toISOString(),
            status: 'pending',
            createdByUserId: actor.userId,
            createdAt: now.toISOString(),
          },
          tx,
        );
      }
      // deadline 직접 갱신 (RfpRepo.transition은 status 전용이라 전용 updateDeadline 사용).
      await this.rfpRepo.updateDeadline(rfpId, input.newDeadline, tx);

      // 감사 로그 (C5) — 재요청과 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'rfp.requote',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { targetPgWsIds: input.targetPgWsIds, newDeadline: input.newDeadline.toISOString() },
        },
        tx,
      );

      // 3) 알림 + 이메일 팬아웃 (대상 PG admin 멤버).
      const deadlineLabel = input.newDeadline.toISOString().replace('T', ' ').slice(0, 16);
      const inboxUrl = `${baseUrlFor('pg')}/inbox/${rfp.code}`;
      const buyerName = (await this.workspaceRepo.findById(rfp.buyerWsId, tx))?.name ?? '구매사';
      const html = await renderRfpRequoteRequested({
        rfpId: rfp.code,
        rfpTitle: rfp.title,
        buyerName,
        message: input.message,
        deadline: deadlineLabel,
        inboxUrl,
      });

      for (const p of plans) {
        // admin 멤버 조회 — acceptPgRequest / createRfp 패턴 그대로 차용 (userId + email 필요)
        const adminRows = await this.workspaceRepo.adminRecipients(p.pgWsId, tx);

        for (const m of adminRows) {
          const notif: Notification = {
            id: randomUUID(),
            userId: m.userId,
            workspaceId: p.pgWsId,
            type: 'rfp.requote_requested',
            title: `[${rfp.code}] 견적 재요청이 도착했어요`,
            body: `${buyerName}가 조건 개선을 요청했어요.`,
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfp.code}`,
            createdAt: now.toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
          await this.outboxRepo.enqueue(
            {
              event: 'rfp.requote_requested',
              to: m.email,
              subject: `[Supporter B · ${rfp.code}] 견적 재요청이 도착했어요`,
              html,
              dedupeKey: `rfp:${rfpId}:requote:ws:${p.pgWsId}:round:${p.round}:user:${m.userId}`,
            },
            tx,
          );
        }
      }

      return { ok: true as const };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  async createRfp(
    input: CreateRfpServiceInput,
    actor: Actor,
  ): Promise<ServiceResult<{ rfpId: string }>> {
    const pendingEmits: Notification[] = [];
    const send = input.send;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult<{ rfpId: string }> = await this._db.transaction(async (tx: any) => {
      const code = await nextRfpId(tx);
      const rfpId = randomUUID();

      const wsRow = await this.workspaceRepo.getBizProfileIdAndName(actor.workspaceId, tx);
      if (!wsRow) return { ok: false as const, error: 'FORBIDDEN_BUYER' };

      const now = new Date();
      let snapshotId: string | null = null;

      if (input.bizProfileMode === 'override') {
        const bizNoOverride = input.bizNoOverride?.trim();
        const gradeOverride = input.gradeOverride;
        if (!bizNoOverride && !gradeOverride) {
          return { ok: false as const, error: 'INVALID_BIZ_PROFILE' };
        }
        snapshotId = randomUUID();
        await this.bizProfileRepo.save(
          {
            id: snapshotId,
            bizNo: bizNoOverride ?? undefined,
            grade: gradeOverride as MerchantGrade | undefined,
            gradeSource: gradeOverride ? 'user_overridden' : 'unset',
            gradeConfirmedBy: gradeOverride ? actor.userId : undefined,
            gradeConfirmedAt: gradeOverride ? now.toISOString() : undefined,
          },
          tx,
        );
      } else if (input.bizProfileMode === 'inherit' && wsRow.bizProfileId) {
        const currentBiz = await this.bizProfileRepo.findById(wsRow.bizProfileId, tx);
        if (!currentBiz) {
          throw new Error(
            `workspace.biz_profile_id=${wsRow.bizProfileId} points to missing biz_profiles row`,
          );
        }
        snapshotId = randomUUID();
        await this.bizProfileRepo.save(
          {
            id: snapshotId,
            bizNo: currentBiz.bizNo,
            taxType: currentBiz.taxType,
            status: currentBiz.status,
            grade: currentBiz.grade,
            gradeSource: currentBiz.gradeSource,
            gradeConfirmedBy: currentBiz.gradeConfirmedBy,
            gradeConfirmedAt: currentBiz.gradeConfirmedAt,
          },
          tx,
        );
      }

      await this.rfpRepo.insertNew(
        {
          id: rfpId,
          code,
          buyerWsId: actor.workspaceId,
          bizProfileId: snapshotId,
          title: input.title.trim(),
          memo: input.memo?.trim() ?? '',
          websiteUrl: input.websiteUrl?.trim() ?? null,
          mainProducts: input.mainProducts?.trim() ?? null,
          annualPgVolume: input.annualPgVolume?.trim() ?? null,
          currentFeeRate: input.currentFeeRate?.trim() ?? null,
          currentSettlementLimit: input.currentSettlementLimit?.trim() ?? null,
          currentGuaranteeInsurance: input.currentGuaranteeInsurance?.trim() ?? null,
          currentSettlementCycle: input.currentSettlementCycle?.trim() ?? null,
          deliveryServicePeriod: input.deliveryServicePeriod?.trim() ?? null,
          boardVisible: input.boardVisible,
          currentFeeVisibleToPg: input.currentFeeVisibleToPg,
          contractType: input.contractType ?? null,
          currentSolution: input.currentSolution ?? null,
          currentSolutionDetail: input.currentSolutionDetail?.trim() ?? null,
          deadline: input.deadline,
          status: send ? 'sent' : 'draft',
          requiredPaymentMethods: input.requiredPaymentMethods,
          customPaymentMethods: input.customPaymentMethods.map((m) => ({
            id: m.id ?? randomUUID(),
            label: m.label.trim(),
          })),
          createdBy: actor.userId,
          sentAt: send ? now : null,
        },
        tx,
      );

      // 감사 로그 (C5) — 생성과 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'rfp.create',
          entityType: 'rfp',
          entityId: code,
          metadata: { title: input.title.trim(), send },
        },
        tx,
      );

      await this.rfpAllowedPgRepo.add(rfpId, input.allowedPgWorkspaceIds, tx);

      const rfpIds = input.rfpAttachmentIds ?? [];
      if (rfpIds.length > 0) {
        await this.attachmentRepo.claim(
          { ids: rfpIds, owner: { rfpId }, uploadedBy: actor.userId },
          tx,
        );
      }

      if (send) {
        const expiresAt = addMinutes(now, INVITE_TTL_DAYS * 24 * 60);
        const buyerName = wsRow.name ?? '구매사';
        const deadlineDisplay = new Date(input.deadline)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 16);

        for (const pgWsId of input.allowedPgWorkspaceIds) {
          const rawToken = generateToken();
          const invId = randomUUID();
          await this.invitationRepo.save(
            {
              id: invId,
              rfpId,
              pgWsId,
              uniqueToken: '',
              sentAt: now.toISOString(),
              expiresAt,
              status: 'sent',
            },
            rawToken,
            tx,
          );

          const adminRows = await this.workspaceRepo.adminRecipients(pgWsId, tx);

          for (const admin of adminRows) {
            const inviteUrl = `${baseUrlFor('pg')}/invite/rfp/${rawToken}`;
            const html = await renderRfpInvited({
              rfpId: code,
              rfpTitle: input.title.trim(),
              buyerName,
              deadline: deadlineDisplay,
              inviteUrl,
            });
            await this.outboxRepo.enqueue(
              {
                event: 'rfp.invited',
                to: admin.email,
                subject: `[Supporter B · ${code}] 견적 요청이 도착했어요`,
                html,
                dedupeKey: `rfp:${rfpId}:invite:ws:${pgWsId}:user:${admin.userId}`,
              },
              tx,
            );
          }

          const allMemberIds = await this.workspaceRepo.memberUserIds(pgWsId, tx);
          for (const userId of allMemberIds) {
            const notif: Notification = {
              id: randomUUID(),
              userId,
              workspaceId: pgWsId,
              type: 'rfp.invited',
              title: `[${code}] 견적 요청이 도착했어요`,
              body: `${buyerName}가 견적을 요청했어요.`,
              channel: 'inapp',
              status: 'pending',
              linkUrl: `/inbox/${code}`,
              createdAt: now.toISOString(),
            };
            await dispatchNotification(tx, notif);
            pendingEmits.push(notif);
          }
        }
      }

      return { ok: true as const, rfpId: code };
    });

    if (result.ok && send) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

declare global {
  var __bidit_rfp_service__: RfpService | undefined;
}

export async function getRfpService(): Promise<RfpService> {
  if (!globalThis.__bidit_rfp_service__) {
    const [
      { db },
      {
        getRfpRepo,
        getContractRepo,
        getOutboxRepo,
        getWorkspaceRepo,
        getBidRepo,
        getInvitationRepo,
        getPgRequestRepo,
        getBizProfileRepo,
        getRfpRequoteRequestRepo,
        getAuditLogRepo,
        getRfpAllowedPgRepo,
        getAttachmentRepo,
      },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [
      rfpRepo,
      contractRepo,
      outboxRepo,
      wsRepo,
      bidRepo,
      invRepo,
      pgReqRepo,
      bizRepo,
      requoteRepo,
      auditRepo,
      allowedPgRepo,
      attachmentRepo,
    ] = await Promise.all([
      getRfpRepo(),
      getContractRepo(),
      getOutboxRepo(),
      getWorkspaceRepo(),
      getBidRepo(),
      getInvitationRepo(),
      getPgRequestRepo(),
      getBizProfileRepo(),
      getRfpRequoteRequestRepo(),
      getAuditLogRepo(),
      getRfpAllowedPgRepo(),
      getAttachmentRepo(),
    ]);

    globalThis.__bidit_rfp_service__ = new RfpService(
      db,
      rfpRepo,
      contractRepo,
      outboxRepo,
      wsRepo,
      bidRepo,
      invRepo,
      pgReqRepo,
      bizRepo,
      requoteRepo,
      auditRepo,
      allowedPgRepo,
      attachmentRepo,
    );
  }
  return globalThis.__bidit_rfp_service__!;
}

export function __resetRfpServiceForTest(): void {
  globalThis.__bidit_rfp_service__ = undefined;
}

export function __setRfpServiceForTest(service: RfpService): void {
  globalThis.__bidit_rfp_service__ = service;
}
