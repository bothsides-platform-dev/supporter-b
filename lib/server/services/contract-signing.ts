import { randomUUID } from 'node:crypto';

import type {
  AuditLogRepo,
  BidRepo,
  PgSigningTemplateRepo,
  RfpRepo,
  SigningContractRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify } from '@/lib/server/notifications/notify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { logger } from '@/lib/observability/logger';
import { SnowSignError, type SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { Notification } from '@/lib/types/notification';
import type {
  SigningContractPatch,
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantStatus,
} from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';

export type { Actor, ServiceResult };

const TERMINAL = new Set<SigningContractStatus>(['completed', 'declined', 'expired', 'canceled']);

type Recipient = { userId: string; workspaceId: string; email: string };

/** RFP + 낙찰 bid 로 SnowSign 템플릿 변수 소스를 구성한다(변수 매핑의 우변 키). */
function buildVariableSources(rfp: RFP, bid: Bid): Record<string, string> {
  return {
    'rfp.title': rfp.title,
    'rfp.code': rfp.code,
    'bid.settleCycle': bid.settleCycle,
    'bid.settleLimit': String(bid.settleLimit),
    'bid.signupFee': String(bid.signupFee ?? 0),
    'bid.guaranteeInsurance': String(bid.guaranteeInsurance),
  };
}

function resolveVariables(
  mapping: Record<string, string>,
  sources: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [varName, srcKey] of Object.entries(mapping)) {
    const v = sources[srcKey];
    if (v !== undefined) out[varName] = v;
  }
  return out;
}

function mapProviderContractStatus(s: string): SigningContractStatus | undefined {
  switch (s) {
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'rejected':
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    default:
      return undefined; // draft/pending/sent — 변화 없음
  }
}

function mapProviderParticipantStatus(s: string): SigningParticipantStatus {
  switch (s) {
    case 'signed':
      return 'signed';
    case 'viewed':
      return 'viewed';
    case 'rejected':
      return 'rejected';
    default:
      return 'pending';
  }
}

export class ContractSigningService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly signingRepo: SigningContractRepo,
    private readonly templateRepo: PgSigningTemplateRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly bidRepo: BidRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly snowsign: SnowSignClient,
  ) {}

  /**
   * award 커밋 후 호출(action 오케스트레이션). PG의 기본 서명 템플릿이 링크돼
   * 있으면 SnowSign 계약을 생성·발송(sent), 없으면 awaiting_pg_template 로 두고
   * PG에 설정 요청 알림. 활성 계약이 이미 있으면 no-op(멱등).
   */
  async onAward(rfpId: string, awardedBidId: string, actor: Actor): Promise<ServiceResult> {
    const existing = await this.signingRepo.findActiveByRfp(rfpId);
    if (existing) return { ok: true }; // 멱등 — 이미 진행 중

    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (rfp.buyerWsId !== actor.workspaceId) return { ok: false, error: 'FORBIDDEN' };
    if (rfp.status !== 'awarded') return { ok: false, error: 'RFP_NOT_AWARDED' };

    const bid = await this.bidRepo.findById(awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };
    const pgWsId = bid.pgWsId;

    const buyerSigner = await this.userRepo.findContactById(rfp.createdBy);
    const pgSigner = await this.userRepo.findContactById(bid.submittedBy);
    if (!buyerSigner || !pgSigner) return { ok: false, error: 'SIGNER_NOT_FOUND' };

    const template = await this.templateRepo.findDefaultByWorkspace(pgWsId);
    const contractId = randomUUID();

    if (!template) {
      return this.persistAwaiting(contractId, rfp, pgWsId, actor);
    }

    // 참여자·변수 매핑 (역할명↔side, bid/rfp→변수)
    const mapped = Object.entries(template.roleMapping).map(([roleName, side]) => {
      const signer = side === 'buyer' ? buyerSigner : pgSigner;
      const userId = side === 'buyer' ? rfp.createdBy : bid.submittedBy;
      const securityMethod: 'easy_cert' | 'email' = signer.phone ? 'easy_cert' : 'email';
      return { roleName, side, signer, userId, securityMethod };
    });
    const variables = resolveVariables(template.variableMapping, buildVariableSources(rfp, bid));

    // SnowSign 계약 생성·발송 (tx 밖 — 네트워크. 멱등 external_id=contractId).
    let providerRef: string;
    try {
      const created = await this.snowsign.createContractFromTemplate(template.snowsignTemplateId, {
        title: `${rfp.title} 전자계약`,
        participants: mapped.map((m) => ({
          name: m.signer.name,
          email: m.signer.email,
          phone: m.signer.phone ?? undefined,
          role: m.roleName,
          securityMethod: m.securityMethod,
        })),
        variables,
        signingOrder: 'parallel',
        externalId: contractId,
      });
      providerRef = created.contractId;
      await this.snowsign.sendContract(providerRef);
    } catch (e) {
      logger.error('signing.onAward_send_failed', {
        rfpId,
        contractId,
        err: e instanceof SnowSignError ? e.code : String(e),
      });
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }

    const now = new Date();
    const participants: SigningParticipant[] = mapped.map((m) => ({
      id: randomUUID(),
      contractId,
      userId: m.userId,
      name: m.signer.name,
      email: m.signer.email,
      phone: m.signer.phone ?? undefined,
      role: m.side,
      securityMethod: m.securityMethod,
      status: 'pending',
    }));

    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any) => {
      await this.signingRepo.create(
        {
          id: contractId,
          rfpId,
          providerRef,
          snowsignTemplateId: template.snowsignTemplateId,
          status: 'sent',
          round: 1,
          createdBy: actor.userId,
          createdAt: now.toISOString(),
          sentAt: now.toISOString(),
        },
        participants,
        tx,
      );
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'signing.sent',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { contractId, providerRef },
        },
        tx,
      );
      for (const rcpt of await this.bothPartyRecipients(rfp, pgWsId, tx)) {
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [rcpt],
            channels: ['inapp'],
            type: 'signing.sent',
            title: `[${rfp.code}] 전자서명이 시작됐어요`,
            body: '이메일로 받은 링크에서 서명을 진행해 주세요.',
            linkUrl: `/rfp/${rfp.code}`,
          })),
        );
      }
      return { ok: true as const };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  private async persistAwaiting(
    contractId: string,
    rfp: RFP,
    pgWsId: string,
    actor: Actor,
  ): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any) => {
      await this.signingRepo.create(
        {
          id: contractId,
          rfpId: rfp.id,
          status: 'awaiting_pg_template',
          round: 1,
          createdBy: actor.userId,
          createdAt: new Date().toISOString(),
        },
        [],
        tx,
      );
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'signing.awaiting_template',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { contractId },
        },
        tx,
      );
      const pgMembers = await this.workspaceRepo.approvedMemberRecipients(pgWsId, tx);
      for (const m of pgMembers) {
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [{ userId: m.userId, workspaceId: pgWsId, email: m.email }],
            channels: ['inapp'],
            type: 'signing.awaiting_template',
            title: `[${rfp.code}] 계약서 서명 템플릿을 설정해 주세요`,
            body: '선정된 견적의 전자서명을 진행하려면 서명 템플릿을 먼저 설정해 주세요.',
            linkUrl: `/inbox/${rfp.code}`,
          })),
        );
      }
      return { ok: true as const };
    });
    if (result.ok) emitAfterCommit(pendingEmits);
    return result;
  }

  /**
   * 폴링(딜룸 진입 lazy + cron)으로 SnowSign 상태를 로컬에 반영한다. 참여자 단위
   * 상태를 미러링하고 계약 상태를 전이한다. 완료는 멱등 ensureFinalized 로 위임한다.
   */
  async reconcileStatus(contractId: string): Promise<ServiceResult> {
    const found = await this.signingRepo.findById(contractId);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const { contract, participants } = found;
    if (TERMINAL.has(contract.status) || !contract.providerRef) return { ok: true };

    let detail;
    try {
      detail = await this.snowsign.getContract(contract.providerRef);
    } catch (e) {
      // 폴링 실패는 다음 주기 재시도 — lastPolledAt 만 갱신하고 삼킨다.
      await this.signingRepo.patchContract(contractId, {
        lastPolledAt: new Date().toISOString(),
      });
      logger.warn('signing.reconcile_failed', {
        contractId,
        err: e instanceof SnowSignError ? e.code : String(e),
      });
      return { ok: true };
    }

    const nextStatus = mapProviderContractStatus(detail.status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      for (const pp of detail.participants) {
        const local = participants.find((lp) => lp.email === pp.email);
        const mappedStatus = mapProviderParticipantStatus(pp.status);
        if (local && local.status !== mappedStatus) {
          await this.signingRepo.patchParticipant(
            local.id,
            { status: mappedStatus, signedAt: pp.signedAt ?? undefined },
            tx,
          );
        }
      }
      const patch: SigningContractPatch = { lastPolledAt: new Date().toISOString() };
      if (nextStatus && nextStatus !== 'completed' && nextStatus !== contract.status) {
        patch.status = nextStatus;
      }
      await this.signingRepo.patchContract(contractId, patch, tx);
    });

    if (nextStatus === 'completed') {
      return this.ensureFinalized(contractId);
    }
    if (
      (nextStatus === 'declined' || nextStatus === 'expired') &&
      nextStatus !== contract.status
    ) {
      await this.notifyTerminal(contract.rfpId, nextStatus);
    }
    return { ok: true };
  }

  /** 멱등 완료 진입점 — 실제 전이한 경우에만 감사·알림. 중복 폴링 안전. */
  async ensureFinalized(contractId: string): Promise<ServiceResult> {
    const transitioned = await this.signingRepo.finalizeIfNotFinal(contractId, new Date());
    if (!transitioned) return { ok: true };

    const found = await this.signingRepo.findById(contractId);
    if (!found) return { ok: true };
    const rfp = await this.rfpRepo.findById(found.contract.rfpId);
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.auditRepo.insert(
        {
          actorUserId: found.contract.createdBy,
          actorWorkspaceId: rfp?.buyerWsId ?? found.contract.createdBy,
          action: 'signing.completed',
          entityType: 'rfp',
          entityId: rfp?.code ?? found.contract.rfpId,
          metadata: { contractId },
        },
        tx,
      );
      if (rfp) {
        const pgWsId = rfp.awardedBidId
          ? (await this.bidRepo.findById(rfp.awardedBidId, tx))?.pgWsId
          : undefined;
        for (const rcpt of await this.bothPartyRecipients(rfp, pgWsId, tx)) {
          pendingEmits.push(
            ...(await notify(tx, {
              recipients: [rcpt],
              channels: ['inapp'],
              type: 'signing.completed',
              title: `[${rfp.code}] 서명 완료`,
              body: '모든 서명이 완료됐어요.',
              linkUrl: `/rfp/${rfp.code}`,
            })),
          );
        }
      }
    });
    emitAfterCommit(pendingEmits);
    return { ok: true };
  }

  private async notifyTerminal(
    rfpId: string,
    status: 'declined' | 'expired',
  ): Promise<void> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return;
    const pgWsId = rfp.awardedBidId
      ? (await this.bidRepo.findById(rfp.awardedBidId))?.pgWsId
      : undefined;
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      for (const rcpt of await this.bothPartyRecipients(rfp, pgWsId, tx)) {
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [rcpt],
            channels: ['inapp'],
            type: `signing.${status}`,
            title:
              status === 'declined'
                ? `[${rfp.code}] 서명이 거절됐어요`
                : `[${rfp.code}] 서명 기한이 만료됐어요`,
            body:
              status === 'declined'
                ? '전자서명이 거절됐어요. 딜룸에서 다시 발송할 수 있어요.'
                : '전자서명 기한이 지났어요. 딜룸에서 다시 발송할 수 있어요.',
            linkUrl: `/rfp/${rfp.code}`,
          })),
        );
      }
    });
    emitAfterCommit(pendingEmits);
  }

  private async bothPartyRecipients(
    rfp: RFP,
    pgWsId: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ): Promise<Recipient[]> {
    const out: Recipient[] = [];
    const buyerMembers = await this.workspaceRepo.approvedMemberRecipients(rfp.buyerWsId, tx);
    for (const m of buyerMembers) {
      out.push({ userId: m.userId, workspaceId: rfp.buyerWsId, email: m.email });
    }
    if (pgWsId) {
      const pgMembers = await this.workspaceRepo.approvedMemberRecipients(pgWsId, tx);
      for (const m of pgMembers) {
        out.push({ userId: m.userId, workspaceId: pgWsId, email: m.email });
      }
    }
    return out;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

declare global {
  var __bidit_contract_signing_service__: ContractSigningService | undefined;
}

export async function getContractSigningService(): Promise<ContractSigningService> {
  if (!globalThis.__bidit_contract_signing_service__) {
    const [
      { db },
      {
        getSigningContractRepo,
        getPgSigningTemplateRepo,
        getRfpRepo,
        getBidRepo,
        getUserRepo,
        getWorkspaceRepo,
        getAuditLogRepo,
      },
      { getSnowSignClient },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
      import('@/lib/server/signing/snowsign-client'),
    ]);
    const [signingRepo, templateRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo] =
      await Promise.all([
        getSigningContractRepo(),
        getPgSigningTemplateRepo(),
        getRfpRepo(),
        getBidRepo(),
        getUserRepo(),
        getWorkspaceRepo(),
        getAuditLogRepo(),
      ]);
    globalThis.__bidit_contract_signing_service__ = new ContractSigningService(
      db,
      signingRepo,
      templateRepo,
      rfpRepo,
      bidRepo,
      userRepo,
      wsRepo,
      auditRepo,
      getSnowSignClient(),
    );
  }
  return globalThis.__bidit_contract_signing_service__!;
}

export function __resetContractSigningServiceForTest(): void {
  globalThis.__bidit_contract_signing_service__ = undefined;
}

export function __setContractSigningServiceForTest(service: ContractSigningService): void {
  globalThis.__bidit_contract_signing_service__ = service;
}
