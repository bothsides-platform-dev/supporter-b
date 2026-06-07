import { randomUUID } from 'node:crypto';

import type {
  BidRepo,
  ContractRepo,
  OutboxRepo,
  RfpRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderRfpAwarded } from '@/lib/server/outbox/templates/rfpAwarded';
import type { Notification } from '@/lib/types/notification';

export type Actor = { userId: string; workspaceId: string };

export type ServiceResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export class RfpService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly rfpRepo: RfpRepo,
    private readonly contractRepo: ContractRepo,
    private readonly outboxRepo: OutboxRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly bidRepo: BidRepo,
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

      const rfpCode = rfp.code;

      // winner: in-app + email per member
      const winnerUserIds = await this.workspaceRepo.memberUserIds(winner.pgWsId, tx);
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
        const loserUserIds = await this.workspaceRepo.memberUserIds(loser.pgWsId, tx);
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

      const rfpCode = rfp.code;
      const allBids = await this.bidRepo.findByRfp(rfpId, tx);
      const submittedPgWsIds = [
        ...new Set(
          allBids.filter((b) => b.status === 'submitted').map((b) => b.pgWsId),
        ),
      ];

      for (const pgWsId of submittedPgWsIds) {
        const memberIds = await this.workspaceRepo.memberUserIds(pgWsId, tx);
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

      const rfpCode = rfp.code;
      const allBids = await this.bidRepo.findByRfp(rfpId, tx);
      const submittedPgWsIds = [
        ...new Set(
          allBids.filter((b) => b.status === 'submitted').map((b) => b.pgWsId),
        ),
      ];

      for (const pgWsId of submittedPgWsIds) {
        const memberIds = await this.workspaceRepo.memberUserIds(pgWsId, tx);
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
}

// ─── Factory ─────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_rfp_service__: RfpService | undefined;
}

export async function getRfpService(): Promise<RfpService> {
  if (!globalThis.__bidit_rfp_service__) {
    const [
      { db },
      { getRfpRepo, getContractRepo, getOutboxRepo, getWorkspaceRepo, getBidRepo },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo] = await Promise.all([
      getRfpRepo(),
      getContractRepo(),
      getOutboxRepo(),
      getWorkspaceRepo(),
      getBidRepo(),
    ]);

    globalThis.__bidit_rfp_service__ = new RfpService(
      db,
      rfpRepo,
      contractRepo,
      outboxRepo,
      wsRepo,
      bidRepo,
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
