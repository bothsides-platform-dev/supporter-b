import { randomUUID } from 'node:crypto';
import { defineAsyncSingleton } from '@/lib/server/_singleton';
import { getDb, getPgMatchingRepo, getRfpRepo, getWorkspaceRepo, getRfpAllowedPgRepo, getInvitationRepo, getAuditLogRepo } from '@/lib/server/repositories/factory';
import { notify } from '@/lib/server/notifications/notify';
import { notifyRfpOperator, type RfpOperatorNotice } from '@/lib/server/notifications/operator-rfp';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderRfpInvited } from '@/lib/server/outbox/templates/rfpInvited';
import { renderMatchingEnded } from '@/lib/server/outbox/templates/matchingEnded';
import type { RFP } from '@/lib/types/rfp';
import { baseUrlFor } from '@/lib/server/env';
import { generateToken } from '@/lib/server/token';
import type { Actor, ServiceResult } from './types';
import type { Notification } from '@/lib/types/notification';
import type { BuyerMatching, PgReview } from '@/lib/rfp/pg-matching';
import type { Tx } from '@/lib/server/repositories/types';

// Every review/quote/next transition locks the same RFP row.
// requested -> reviewing -> quoted -> award (existing workflow)
// requested/reviewing -> rejected, quoted -> withdrawn -> next PG
class PgMatchingService {
  constructor(private readonly db: Tx) {}

  async forBuyer(rfpId: string, workspaceId: string, includeTestPg = false): Promise<BuyerMatching | null> {
    const rfp = await (await getRfpRepo()).findById(rfpId);
    if (!rfp || rfp.buyerWsId !== workspaceId) return null;
    const repo = await getPgMatchingRepo();
    const request = await repo.find(rfpId);
    if (!request) return null;
    const reviews = await repo.reviews(rfpId);
    return { industryName: request.industryName, reviews,
      recommendation: await repo.recommendation(request.groupId, reviews.map(r => r.pgWorkspaceId), undefined, includeTestPg) };
  }

  async review(rfpId: string, reviewId: string, status: 'reviewing' | 'rejected', reason: string, actor: Actor): Promise<ServiceResult> {
    if (status === 'rejected' && (!reason.trim() || reason.trim().length > 500)) return { ok: false, error: 'INVALID_INPUT' };
    const repo = await getPgMatchingRepo();
    const pending: Notification[] = [];
    let operatorNotice: RfpOperatorNotice | undefined;
    const result = await this.db.transaction(async (tx: Tx): Promise<ServiceResult> => {
      const rfp = await (await getRfpRepo()).findByIdForUpdate(rfpId, tx);
      if (!rfp || rfp.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };
      const mine = (await repo.reviews(rfpId, tx)).find(r => r.id === reviewId && r.pgWorkspaceId === actor.workspaceId);
      if (!mine || !['requested', 'reviewing'].includes(mine.status)) return { ok: false, error: 'MATCHING_REVIEW_CLOSED' };
      if (mine.status === status) return { ok: true };
      await repo.updateReview(mine.id, status, status === 'rejected' ? reason.trim() : '', tx);
      operatorNotice = { event: status === 'reviewing' ? 'consultation_reviewing' : 'consultation_rejected', rfpCode: rfp.code, rfpTitle: rfp.title, pgNames: [mine.candidate.name] };
      await (await getAuditLogRepo()).insert({ actorUserId: actor.userId, actorWorkspaceId: actor.workspaceId, action: `rfp.review_${status}`, entityType: 'rfp', entityId: rfp.code, metadata: { reviewId: mine.id } }, tx);
      if (status === 'rejected') pending.push(...await notifyMatchingEnded(tx, rfp, mine, reason.trim()));
      else {
        const members = await (await getWorkspaceRepo()).approvedMemberRecipients(rfp.buyerWsId, tx);
        pending.push(...await notify(tx, { recipients: members.map(m => ({ ...m, workspaceId: rfp.buyerWsId })), channels: ['inapp'], type: 'rfp.review_reviewing',
          title: 'PG사가 상담 내용을 검토하고 있어요', body: `${mine.candidate.name}에서 검토를 시작했어요.`, linkUrl: `/rfp/${rfp.code}` }));
      }
      return { ok: true };
    });
    if (result.ok) { emitAfterCommit(pending); flushAfterCommit(); if (operatorNotice) void notifyRfpOperator(operatorNotice); }
    return result;
  }

  async next(rfpId: string, previousReviewId: string, pgWorkspaceId: string, deadline: Date, actor: Actor, includeTestPg = false): Promise<ServiceResult> {
    if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) return { ok: false, error: 'INVALID_INPUT' };
    const repo = await getPgMatchingRepo();
    const pending: Notification[] = [];
    let operatorNotice: RfpOperatorNotice | undefined;
    const result = await this.db.transaction(async (tx: Tx): Promise<ServiceResult> => {
      const rfpRepo = await getRfpRepo();
      const rfp = await rfpRepo.findByIdForUpdate(rfpId, tx);
      if (!rfp || rfp.buyerWsId !== actor.workspaceId) return { ok: false, error: 'FORBIDDEN' };
      if (rfp.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };
      if (deadline.getTime() <= Date.now()) return { ok: false, error: 'INVALID_INPUT' };
      const request = await repo.find(rfpId, tx);
      const reviews = await repo.reviews(rfpId, tx);
      const previous = reviews.at(-1);
      if (!request || !previous || previous.id !== previousReviewId || !['rejected', 'withdrawn'].includes(previous.status)) return { ok: false, error: 'MATCHING_BUSY' };
      const recommendation = await repo.recommendation(request.groupId, reviews.map(r => r.pgWorkspaceId), tx, includeTestPg);
      const candidate = recommendation.candidates.find(c => c.pgWorkspaceId === pgWorkspaceId);
      if (!candidate) return { ok: false, error: 'MATCHING_UNAVAILABLE' };
      await repo.addReview(rfpId, candidate, tx);
      await rfpRepo.updateDeadline(rfpId, deadline, tx);
      await (await getRfpAllowedPgRepo()).add(rfpId, [pgWorkspaceId], tx);
      const token = generateToken();
      const now = new Date().toISOString();
      await (await getInvitationRepo()).save({ id: randomUUID(), rfpId, pgWsId: pgWorkspaceId, uniqueToken: '', sentAt: now, expiresAt: deadline.toISOString(), status: 'sent' }, token, tx);
      const ws = await getWorkspaceRepo();
      const members = await ws.approvedMemberRecipients(pgWorkspaceId, tx);
      const buyerName = await ws.getName(actor.workspaceId, tx) ?? '구매사';
      const html = await renderRfpInvited({ rfpId: rfp.code, rfpTitle: rfp.title, buyerName, deadline: deadline.toISOString(), inviteUrl: `${baseUrlFor('pg')}/invite/rfp/${token}` });
      pending.push(...await notify(tx, { recipients: members.map(m => ({ ...m, workspaceId: pgWorkspaceId })), channels: ['inapp', 'email'], type: 'rfp.invited', title: '새 상담 요청이 도착했어요', body: `${buyerName}가 상담을 요청했어요.`, linkUrl: `/inbox/${rfp.code}`,
        email: { event: 'rfp.invited', subject: '[서포트비] 새 상담 요청이 도착했어요', html, dedupeKey: r => `matching:${rfpId}:${pgWorkspaceId}:${r.userId}` } }));
      await (await getAuditLogRepo()).insert({ actorUserId: actor.userId, actorWorkspaceId: actor.workspaceId, action: 'rfp.matching_next', entityType: 'rfp', entityId: rfp.code, metadata: { previousReviewId, pgWorkspaceId } }, tx);
      operatorNotice = { event: 'consultation_next', rfpCode: rfp.code, rfpTitle: rfp.title, pgNames: [candidate.name] };
      return { ok: true };
    });
    if (result.ok) { emitAfterCommit(pending); flushAfterCommit(); if (operatorNotice) void notifyRfpOperator(operatorNotice); }
    return result;
  }
}

export async function notifyMatchingEnded(tx: Tx, rfp: RFP, review: PgReview, reason: string): Promise<Notification[]> {
  const members = await (await getWorkspaceRepo()).approvedMemberRecipients(rfp.buyerWsId, tx);
  const html = await renderMatchingEnded(rfp.code, review.candidate.name, reason);
  return notify(tx, { recipients: members.map(m => ({ ...m, workspaceId: rfp.buyerWsId })), channels: ['inapp', 'email'], type: 'rfp.matching_ended',
    title: '다음 PG사에 상담을 요청할 수 있어요', body: reason, linkUrl: `/rfp/${rfp.code}`,
    email: { event: 'rfp.matching_ended', subject: '[서포트비] PG사 상담 결과를 확인해주세요', html, dedupeKey: r => `matching-ended:${review.id}:${r.userId}` } });
}

/** Call only while holding the RFP row lock. Missing matching row means a legacy RFP. */
export async function matchingBidReview(rfpId: string, pgWorkspaceId: string, tx: Tx): Promise<{ ok: true; review?: PgReview } | { ok: false; error: string }> {
  const repo = await getPgMatchingRepo();
  if (!await repo.find(rfpId, tx)) return { ok: true };
  const review = (await repo.reviews(rfpId, tx)).find(r => r.pgWorkspaceId === pgWorkspaceId);
  if (!review || !['requested', 'reviewing', 'quoted'].includes(review.status)) return { ok: false, error: 'MATCHING_REVIEW_CLOSED' };
  return { ok: true, review };
}

export const { get: getPgMatchingService } = defineAsyncSingleton('pg_matching_service', 'service', async () => new PgMatchingService(await getDb()));
