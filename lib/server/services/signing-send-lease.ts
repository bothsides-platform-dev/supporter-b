import { EMBED_SEND_LEASE_MS } from '@/lib/signing/embed-lease';
import { logger } from '@/lib/observability/logger';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify } from '@/lib/server/notifications/notify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import type {
  AuditLogRepo,
  SigningContractRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import type { RFP } from '@/lib/types/rfp';
import type { Notification } from '@/lib/types/notification';
import type { Actor, ServiceResult } from './types';

type ClaimInput = {
  contractId: string;
  holderUserId: string;
  now: Date;
};

type RenewInput = {
  contractId: string;
  holderUserId: string;
  current: Date;
  next: Date;
};

export class SigningSendLease {
  private readonly signingRepo: SigningContractRepo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;
  private readonly workspaceRepo: WorkspaceRepo;
  private readonly auditRepo: AuditLogRepo;

  constructor(deps: {
    signingRepo: SigningContractRepo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
    workspaceRepo: WorkspaceRepo;
    auditRepo: AuditLogRepo;
  }) {
    this.signingRepo = deps.signingRepo;
    this.db = deps.db;
    this.workspaceRepo = deps.workspaceRepo;
    this.auditRepo = deps.auditRepo;
  }

  async claim(
    input: ClaimInput,
  ): Promise<
    | { ok: true }
    | { ok: false; error: 'SEND_HELD_BY_TEAMMATE' }
  > {
    const claimed = await this.signingRepo.claimForSend(
      input.contractId,
      input.now,
      new Date(input.now.getTime() - EMBED_SEND_LEASE_MS),
      input.holderUserId,
    );
    return claimed
      ? { ok: true }
      : { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
  }

  async renew(
    input: RenewInput,
  ): Promise<
    | { ok: true; claimedAt: Date }
    | { ok: false; error: 'SEND_TAKEN_OVER' | 'CONTRACT_BUSY' }
  > {
    const renewed = await this.signingRepo.renewSendClaim(
      input.contractId,
      input.current,
      input.next,
    );
    if (!renewed) {
      const lease = await this.signingRepo.findSendLease(input.contractId);
      return lease?.holderUserId && lease.holderUserId !== input.holderUserId
        ? { ok: false, error: 'SEND_TAKEN_OVER' }
        : { ok: false, error: 'CONTRACT_BUSY' };
    }
    return { ok: true, claimedAt: input.next };
  }

  async release(input: {
    contractId: string;
    claimedAt: Date;
    surface?: 'default' | 'embed' | 'recovery';
  }): Promise<{ ok: true }> {
    try {
      await this.signingRepo.releaseSendClaim(input.contractId, input.claimedAt);
    } catch (e) {
      const event =
        input.surface === 'embed'
          ? 'signing.release_embed_claim_failed'
          : input.surface === 'recovery'
            ? 'signing.recover_release_failed'
            : 'signing.release_claim_failed';
      logger.warn(event, {
        contractId: input.contractId,
        err: String(e),
      });
    }
    return { ok: true };
  }

  async holder(input: {
    contractId: string;
    workspaceId: string;
    actorUserId: string;
  }): Promise<{ holder: { userId: string; name: string } | null; isSelf: boolean }> {
    const lease = await this.signingRepo.findSendLease(input.contractId);
    if (!lease?.holderUserId) return { holder: null, isSelf: false };
    const isSelf = lease.holderUserId === input.actorUserId;
    const member = (await this.workspaceRepo.teamRoster(input.workspaceId)).find(
      (candidate) => candidate.userId === lease.holderUserId,
    );
    return {
      holder: member ? { userId: member.userId, name: member.name } : null,
      isSelf,
    };
  }

  async takeOver(input: {
    rfp: RFP;
    pgWsId: string;
    contractId: string;
    now: Date;
    actor: Actor;
    surface: 'embed' | 'template' | 'compose';
  }): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    let taken = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.db.transaction(async (tx: any) => {
      const result = await this.signingRepo.forceClaimForSend(
        input.contractId,
        input.now,
        input.actor.userId,
        tx,
      );
      if (!result.taken) return;
      taken = true;
      await this.auditRepo.insert(
        {
          actorUserId: input.actor.userId,
          actorWorkspaceId: input.actor.workspaceId,
          action: 'signing.send_claim_taken',
          entityType: 'rfp',
          entityId: input.rfp.code,
          metadata: {
            contractId: input.contractId,
            displacedUserId: result.displacedUserId,
            surface: input.surface,
          },
        },
        tx,
      );
      if (!result.displacedUserId || result.displacedUserId === input.actor.userId) return;
      const member = (await this.workspaceRepo.approvedMemberRecipients(input.pgWsId, tx)).find(
        (candidate) => candidate.userId === result.displacedUserId,
      );
      if (!member) return;
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: [
            { userId: member.userId, workspaceId: input.pgWsId, email: member.email },
          ],
          channels: ['inapp'],
          type: 'signing.send_taken_over',
          title: `[${input.rfp.code}] 다른 담당자가 계약서 작성을 이어받았어요`,
          body: '작성 중이던 화면은 이제 쓸 수 없어요. 그 화면에서 발송하면 계약서가 두 번 나가요.',
          linkUrl: `/inbox/${input.rfp.code}`,
        })),
      );
    });
    if (!taken) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
    return { ok: true };
  }

}
