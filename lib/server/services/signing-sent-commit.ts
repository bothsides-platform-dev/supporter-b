import { randomUUID } from 'node:crypto';

import { logger } from '@/lib/observability/logger';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify } from '@/lib/server/notifications/notify';
import { notifySigningOperator } from '@/lib/server/notifications/operator-signing';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import type {
  AuditLogRepo,
  SigningContractRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { captureSigningError } from '@/lib/server/signing/observability';
import type { SnowSignContractDetail } from '@/lib/server/signing/snowsign-client';
import { PROVIDER_ENFORCED_SECURITY_METHOD } from '@/lib/signing/security-method';
import type { Notification } from '@/lib/types/notification';
import type { RFP } from '@/lib/types/rfp';
import type {
  SentContractSnapshot,
  SigningContract,
  SigningParticipant,
} from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';
import { signingPartyLink, signingPartyRecipients } from './signing-party-notifications';

export class SigningSentCommitConflict extends Error {
  constructor() {
    super('contract left awaiting during sent commit');
    this.name = 'SigningSentCommitConflict';
  }
}

type CreatedCommitInput = {
  active: SigningContract;
  rfp: RFP;
  actor: Actor;
  now: Date;
  providerRef: string;
  sentAt: string;
  participants: SigningParticipant[];
  draft:
    | { origin: 'template'; snowsignTemplateId: string }
    | { origin: 'compose'; sentDocument: SentContractSnapshot };
  auditMetadata: Record<string, unknown>;
};

type ObservedCommitInput = {
  active: SigningContract;
  rfp: RFP;
  detail: SnowSignContractDetail;
  providerContractId: string;
  actor: Actor;
  source: 'embed' | 'recovery' | 'self_heal';
  pgWsId: string;
  pgSubmittedBy?: string;
};

type ObservedCommitResult = ServiceResult<{
  participantMismatch?: boolean;
  shouldFinalize?: boolean;
}>;

class ObservedCommitConflict extends Error {}

export function mapProviderParticipantStatus(
  status: string,
): SigningParticipant['status'] | undefined {
  switch (status.trim().toLowerCase()) {
    case 'signed':
      return 'signed';
    case 'viewed':
      return 'viewed';
    case 'rejected':
      return 'rejected';
    default:
      return undefined;
  }
}

function providerRefConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  return (
    (record.code ?? record.cause?.code) === '23505' &&
    String(record.message ?? '').includes('provider_ref')
  );
}

export class SigningSentCommit {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly db: any,
    private readonly signingRepo: SigningContractRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly userRepo: UserRepo,
  ) {}

  async confirmCreated(input: CreatedCommitInput): Promise<void> {
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.db.transaction(async (tx: any) => {
      const committed = await this.signingRepo.markSentIfAwaiting(
        input.active.id,
        { providerRef: input.providerRef, sentAt: input.sentAt, draft: input.draft },
        tx,
        { claimedAt: input.now },
      );
      if (!committed) throw new SigningSentCommitConflict();
      await this.signingRepo.insertParticipants(input.participants, tx);
      await this.auditRepo.insert(
        {
          actorUserId: input.actor.userId,
          actorWorkspaceId: input.actor.workspaceId,
          action: 'signing.sent',
          entityType: 'rfp',
          entityId: input.rfp.code,
          metadata: input.auditMetadata,
        },
        tx,
      );
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: await signingPartyRecipients(
            this.workspaceRepo,
            input.rfp,
            input.actor.workspaceId,
            tx,
          ),
          channels: ['inapp'],
          type: 'signing.sent',
          title: `[${input.rfp.code}] 전자서명이 시작됐어요`,
          body: '이메일로 받은 링크에서 서명을 진행해 주세요.',
          linkUrl: (recipient) => signingPartyLink(recipient, input.rfp),
        })),
      );
    });
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
    void notifySigningOperator({
      event: 'sent',
      rfpCode: input.rfp.code,
      rfpTitle: input.rfp.title,
      round: input.active.round,
    });
  }

  async bindObserved(input: ObservedCommitInput): Promise<ObservedCommitResult> {
    const buyerEmail = (
      await this.userRepo.findContactById(input.rfp.createdBy)
    )?.email.toLowerCase();
    const pgEmail = input.pgSubmittedBy
      ? (await this.userRepo.findContactById(input.pgSubmittedBy))?.email.toLowerCase()
      : undefined;
    const now = new Date();
    const participants: SigningParticipant[] = input.detail.participants.map((participant) => {
      const email = participant.email.toLowerCase();
      const isBuyer = !!buyerEmail && email === buyerEmail;
      return {
        id: randomUUID(),
        contractId: input.active.id,
        userId: isBuyer
          ? input.rfp.createdBy
          : email === pgEmail
            ? input.pgSubmittedBy
            : undefined,
        name: participant.name,
        email: participant.email,
        phone: participant.phone,
        role: isBuyer ? 'buyer' : 'pg',
        securityMethod:
          participant.securityMethod === PROVIDER_ENFORCED_SECURITY_METHOD
            ? 'easy_cert'
            : 'email',
        status: mapProviderParticipantStatus(participant.status) ?? 'pending',
        signedAt: participant.signedAt,
        emailDelivery: participant.emailDelivery,
      };
    });
    const participantMismatch =
      !!buyerEmail &&
      !input.detail.participants.some(
        (participant) => participant.email.toLowerCase() === buyerEmail,
      );
    const pendingEmits: Notification[] = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.db.transaction(async (tx: any) => {
        const committed = await this.signingRepo.markSentIfAwaiting(
          input.active.id,
          {
            providerRef: input.providerContractId,
            sentAt: input.detail.sentAt ?? now.toISOString(),
            status:
              input.detail.status.trim().toLowerCase() === 'in_progress'
                ? 'in_progress'
                : 'sent',
            draft: null,
          },
          tx,
        );
        if (!committed) throw new ObservedCommitConflict();
        await this.signingRepo.insertParticipants(participants, tx);
        await this.auditRepo.insert(
          {
            actorUserId: input.actor.userId,
            actorWorkspaceId: input.actor.workspaceId,
            action: 'signing.sent',
            entityType: 'rfp',
            entityId: input.rfp.code,
            metadata: {
              contractId: input.active.id,
              providerRef: input.providerContractId,
              participantMismatch,
              source: input.source,
            },
          },
          tx,
        );
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: await signingPartyRecipients(
              this.workspaceRepo,
              input.rfp,
              input.pgWsId,
              tx,
            ),
            channels: ['inapp'],
            type: 'signing.sent',
            title:
              input.source !== 'embed'
                ? `[${input.rfp.code}] 보낸 계약서를 딜룸에 연결했어요`
                : `[${input.rfp.code}] 전자서명이 시작됐어요`,
            body:
              input.source !== 'embed'
                ? '이미 발송된 계약서를 딜룸에 연결했어요. 서명 진행 상황이 그대로 반영돼요.'
                : '이메일로 받은 링크에서 서명을 진행해 주세요.',
            linkUrl: (recipient) => signingPartyLink(recipient, input.rfp),
          })),
        );
      });
    } catch (error) {
      if (error instanceof ObservedCommitConflict) {
        logger.warn('signing.attach_lost_race', {
          contractId: input.active.id,
          providerRef: input.providerContractId,
        });
        return { ok: false, error: 'CONTRACT_CHANGED' };
      }
      if (providerRefConflict(error)) {
        logger.warn('signing.attach_provider_ref_conflict', {
          contractId: input.active.id,
          providerRef: input.providerContractId,
        });
        return { ok: false, error: 'PROVIDER_CONTRACT_TAKEN' };
      }
      logger.error('signing.attach_persist_failed', {
        contractId: input.active.id,
        providerRef: input.providerContractId,
        err: String(error),
      });
      captureSigningError('signing.attach_persist_failed', error, {
        contractId: input.active.id,
        providerRef: input.providerContractId,
        rfpCode: input.rfp.code,
      });
      return { ok: false, error: 'PERSIST_FAILED' };
    }

    emitAfterCommit(pendingEmits);
    flushAfterCommit();
    void notifySigningOperator({
      event: input.source === 'embed' ? 'sent' : 'attached',
      rfpCode: input.rfp.code,
      rfpTitle: input.rfp.title,
      round: input.active.round,
    });
    return {
      ok: true,
      participantMismatch,
      shouldFinalize: input.detail.status.trim().toLowerCase() === 'completed',
    };
  }

}
