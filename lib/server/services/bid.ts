import { randomUUID } from 'node:crypto';

import type {
  AttachmentRepo,
  AuditLogRepo,
  BidNoteRepo,
  BidRepo,
  InvitationRepo,
  RfpRepo,
  RfpRequoteRequestRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify } from '@/lib/server/notifications/notify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderBidSubmitted } from '@/lib/server/outbox/templates/bidSubmitted';
import { getStorage } from '@/lib/server/storage';
import type { Notification } from '@/lib/types/notification';
import type { Actor, ServiceResult } from './types';

export type SubmitBidServiceInput = {
  rfpId: string;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  paymentFees: Record<string, number | import('@/lib/types/bid').TierRates>;
  customFees: Record<string, number>;
  proposalAttachmentId?: string;
  memo?: string;
};

export type { Actor, ServiceResult };

export class BidService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly bidRepo: BidRepo,
    private readonly invitationRepo: InvitationRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly bidNoteRepo: BidNoteRepo,
    private readonly requoteRepo: RfpRequoteRequestRepo,
    private readonly auditRepo: AuditLogRepo,
  ) {}

  async withdraw(bidId: string, actor: Actor): Promise<ServiceResult> {
    const bid = await this.bidRepo.findById(bidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    if (bid.pgWsId !== actor.workspaceId) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const rfp = await this.rfpRepo.findById(bid.rfpId);
    if (rfp?.status === 'awarded') {
      return { ok: false, error: 'ALREADY_AWARDED' };
    }

    const canAccess = await this.invitationRepo.canAccess(bid.rfpId, actor.workspaceId);
    if (!canAccess) return { ok: false, error: 'FORBIDDEN' };

    if (bid.status === 'withdrawn') return { ok: true };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.bidRepo.updateStatus(bid.id, 'withdrawn', tx);
      // 감사 로그 (C5) — 철회와 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'bid.withdraw',
          entityType: 'rfp',
          entityId: rfp?.code ?? bid.rfpId,
          metadata: { bidId: bid.id },
        },
        tx,
      );
    });

    return { ok: true };
  }

  async submit(
    input: SubmitBidServiceInput,
    actor: Actor,
  ): Promise<ServiceResult<{ bidId: string; rfpCode: string }>> {
    const canAccess = await this.invitationRepo.canAccess(input.rfpId, actor.workspaceId);
    if (!canAccess) return { ok: false, error: 'FORBIDDEN' };

    const rfp = await this.rfpRepo.findById(input.rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (rfp.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };

    const required = rfp.requiredPaymentMethods;
    if (required.length > 0) {
      for (const method of Object.keys(input.paymentFees)) {
        if (!required.includes(method as (typeof required)[number])) {
          return { ok: false, error: 'PAYMENT_METHOD_NOT_REQUESTED' };
        }
      }
    }
    const customIds = new Set(rfp.customPaymentMethods.map((m) => m.id));
    for (const id of Object.keys(input.customFees)) {
      if (!customIds.has(id)) {
        return { ok: false, error: 'PAYMENT_METHOD_NOT_REQUESTED' };
      }
    }

    const allInvs = await this.invitationRepo.findByRfp(input.rfpId);
    const myInv = allInvs.find((i) => i.pgWsId === actor.workspaceId);
    if (!myInv) return { ok: false, error: 'INVITATION_NOT_FOUND' };

    if (input.proposalAttachmentId) {
      const att = await this.attachmentRepo.findById(input.proposalAttachmentId);
      if (!att || att.rfpId || att.bidId || att.bidNoteId) {
        return { ok: false, error: 'INVALID_ATTACHMENT' };
      }
      // 본인이 올린 미링크 첨부만 허용 — team-chat·bid-note 와 동일 기준.
      // (isMember 기준은 마스터/운영 임퍼소네이션 계정을 false 처리하는 버그였다:
      //  마스터는 workspace_members 행이 없어 자기가 올린 견적서도 거부됐다.)
      if (att.uploadedBy !== actor.userId) {
        return { ok: false, error: 'INVALID_ATTACHMENT' };
      }
    }

    const existingBids = await this.bidRepo.findByRfp(input.rfpId);
    const myBids = existingBids.filter((b) => b.pgWsId === actor.workspaceId);
    const maxRound = myBids.reduce((m, b) => Math.max(m, b.round), 0);

    let round = 1;
    let respondedRequoteId: string | null = null;
    if (maxRound >= 1) {
      // 이미 견적이 있다 — pending 재요청이 있어야만 새 라운드 제출 허용.
      const pending = await this.requoteRepo.findPendingByPair(input.rfpId, actor.workspaceId);
      if (!pending) return { ok: false, error: 'BID_ALREADY_SUBMITTED' };
      if (new Date(pending.deadline).getTime() < Date.now()) {
        return { ok: false, error: 'REQUOTE_DEADLINE_PASSED' };
      }
      round = maxRound + 1;
      respondedRequoteId = pending.id;
    }

    const bidId = randomUUID();
    const now = new Date();
    const pendingEmits: Notification[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any) => {
      await this.bidRepo.save(
        {
          id: bidId,
          rfpId: input.rfpId,
          pgWsId: actor.workspaceId,
          invitationId: myInv.id,
          settleCycle: input.settleCycle,
          settleLimit: input.settleLimit,
          guaranteeInsurance: input.guaranteeInsurance,
          paymentFees: input.paymentFees,
          customFees: input.customFees,
          proposalPdfs: [],
          memo: input.memo,
          status: 'submitted',
          submittedBy: actor.userId,
          submittedAt: now.toISOString(),
          round,
        },
        tx,
      );

      if (respondedRequoteId) {
        await this.requoteRepo.markResponded(respondedRequoteId, now, tx);
      }

      // 감사 로그 (C5) — 제출과 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'bid.submit',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { bidId, round },
        },
        tx,
      );

      if (input.proposalAttachmentId) {
        await this.attachmentRepo.claim(
          { ids: [input.proposalAttachmentId], owner: { bidId } },
          tx,
        );
      }

      const buyerMembers = await this.workspaceRepo.approvedMemberRecipients(rfp.buyerWsId, tx);

      const pgWsLabel = (await this.workspaceRepo.getName(actor.workspaceId, tx)) ?? 'PG';

      const submittedHtml = await renderBidSubmitted({
        rfpId: rfp.code,
        rfpTitle: rfp.title,
        pgName: pgWsLabel,
        submittedAt: now.toISOString().replace('T', ' ').slice(0, 16),
      });

      for (const m of buyerMembers) {
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [{ userId: m.userId, workspaceId: rfp.buyerWsId, email: m.email }],
            channels: ['inapp', 'email'],
            type: 'bid.submitted',
            title: `[${rfp.code}] ${pgWsLabel} 견적이 도착했어요`,
            body: `${pgWsLabel}가 견적을 보냈어요.`,
            linkUrl: `/rfp/${rfp.code}`,
            email: {
              event: 'bid.submitted',
              subject: `[서포트비 · ${rfp.code}] ${pgWsLabel} 견적이 도착했어요`,
              html: submittedHtml,
              dedupeKey: () => `bid:${input.rfpId}:${actor.workspaceId}:${m.userId}`,
            },
          })),
        );
      }

      return { ok: true as const, bidId, rfpCode: rfp.code };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  async addNote(
    input: { bidId: string; body: string; attachmentIds: string[] },
    actor: Actor,
  ): Promise<ServiceResult<{ noteId: string }>> {
    const body = input.body.trim();
    if (body.length === 0 && input.attachmentIds.length === 0) {
      return { ok: false, error: 'NOTE_EMPTY' };
    }

    const bid = await this.bidRepo.findById(input.bidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    const rfp = await this.rfpRepo.findById(bid.rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (rfp.buyerWsId !== actor.workspaceId) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const noteId = randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txResult = await this._db.transaction(async (tx: any) => {
      if (input.attachmentIds.length > 0) {
        const rows = await this.attachmentRepo.findUnclaimedByIds(input.attachmentIds, tx);
        if (rows.length !== input.attachmentIds.length) return 'INVALID_ATTACHMENT' as const;
        for (const r of rows) {
          if (r.uploadedBy !== actor.userId || r.rfpId || r.bidId || r.bidNoteId) {
            return 'INVALID_ATTACHMENT' as const;
          }
        }
      }

      await this.bidNoteRepo.save(
        { id: noteId, bidId: input.bidId, authorId: actor.userId, body, createdAt: new Date() },
        tx,
      );

      if (input.attachmentIds.length > 0) {
        await this.attachmentRepo.claim(
          { ids: input.attachmentIds, owner: { bidNoteId: noteId }, uploadedBy: actor.userId },
          tx,
        );
      }
      return 'ok' as const;
    });

    if (txResult === 'INVALID_ATTACHMENT') {
      return { ok: false, error: 'INVALID_ATTACHMENT' };
    }
    return { ok: true, noteId };
  }

  async removeNote(noteId: string, actor: Actor): Promise<ServiceResult> {
    const note = await this.bidNoteRepo.findById(noteId);
    if (!note) return { ok: false, error: 'NOTE_NOT_FOUND' };

    const bid = await this.bidRepo.findById(note.bidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    const rfp = await this.rfpRepo.findById(bid.rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (rfp.buyerWsId !== actor.workspaceId) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const attIds = await this.bidNoteRepo.findAttachmentIds(noteId);
    const storage = getStorage();
    for (const id of attIds) {
      await storage.delete(id).catch(() => {});
    }

    await this.bidNoteRepo.remove(noteId);
    return { ok: true };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

declare global {
  var __bidit_bid_service__: BidService | undefined;
}

export async function getBidService(): Promise<BidService> {
  if (!globalThis.__bidit_bid_service__) {
    const [
      { db },
      { getBidRepo, getInvitationRepo, getRfpRepo, getWorkspaceRepo, getAttachmentRepo, getBidNoteRepo, getRfpRequoteRequestRepo, getAuditLogRepo },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo] =
      await Promise.all([
        getBidRepo(), getInvitationRepo(), getRfpRepo(),
        getWorkspaceRepo(), getAttachmentRepo(), getBidNoteRepo(),
        getRfpRequoteRequestRepo(), getAuditLogRepo(),
      ]);

    globalThis.__bidit_bid_service__ = new BidService(
      db, bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo,
    );
  }
  return globalThis.__bidit_bid_service__!;
}

export function __resetBidServiceForTest(): void {
  globalThis.__bidit_bid_service__ = undefined;
}

export function __setBidServiceForTest(service: BidService): void {
  globalThis.__bidit_bid_service__ = service;
}
