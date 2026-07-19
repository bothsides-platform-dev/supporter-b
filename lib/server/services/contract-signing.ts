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
  PgSigningTemplate,
  SigningContract,
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantStatus,
} from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';

export type { Actor, ServiceResult };

const TERMINAL = new Set<SigningContractStatus>(['completed', 'declined', 'expired', 'canceled']);

type Recipient = { userId: string; workspaceId: string; email: string };
type Party = 'buyer' | 'pg';

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
   * award 커밋 후 호출(action 오케스트레이션). PG 기본 템플릿 링크 有 → SnowSign
   * 계약 생성·발송(sent), 無 → awaiting_pg_template + PG에 설정 요청. 활성 계약이
   * 이미 있으면 no-op(멱등).
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

    const template = await this.templateRepo.findDefaultByWorkspace(bid.pgWsId);
    const contractId = randomUUID();
    if (!template) return this.persistAwaiting(contractId, rfp, bid.pgWsId, actor);
    return this.performSend(rfp, bid, template, actor, {
      contractId,
      mode: 'create',
      round: 1,
      createdBy: actor.userId,
    });
  }

  /** PG가 서명 템플릿을 링크한 뒤 호출 — 이 PG가 낙찰한 awaiting 계약들을 발송한다. */
  async onTemplateReady(pgWsId: string, actor: Actor): Promise<ServiceResult> {
    const template = await this.templateRepo.findDefaultByWorkspace(pgWsId);
    if (!template) return { ok: true };
    const awaiting = await this.signingRepo.findAwaiting();
    for (const c of awaiting) {
      const rfp = await this.rfpRepo.findById(c.rfpId);
      if (!rfp?.awardedBidId) continue;
      const bid = await this.bidRepo.findById(rfp.awardedBidId);
      if (!bid || bid.pgWsId !== pgWsId) continue;
      await this.performSend(rfp, bid, template, actor, {
        contractId: c.id,
        mode: 'update',
        round: c.round,
        createdBy: c.createdBy,
      });
    }
    return { ok: true };
  }

  /** 참여자 취소 — ACL(양측) + SnowSign cancel 전파 + 로컬 canceled + 감사·알림. */
  async cancel(contractId: string, actor: Actor, reason?: string): Promise<ServiceResult> {
    const found = await this.signingRepo.findById(contractId);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const rfp = await this.rfpRepo.findById(found.contract.rfpId);
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    if (TERMINAL.has(found.contract.status)) return { ok: true };

    if (found.contract.providerRef) {
      try {
        await this.snowsign.cancel(found.contract.providerRef, reason);
      } catch (e) {
        logger.warn('signing.cancel_provider_failed', { contractId, err: String(e) });
      }
    }

    const pgWsId = rfp.awardedBidId
      ? (await this.bidRepo.findById(rfp.awardedBidId))?.pgWsId
      : undefined;
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.signingRepo.patchContract(
        contractId,
        { status: 'canceled', canceledAt: new Date().toISOString(), cancelReason: reason },
        tx,
      );
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'signing.canceled',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { contractId, reason },
        },
        tx,
      );
      for (const rcpt of await this.bothPartyRecipients(rfp, pgWsId, tx)) {
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [rcpt],
            channels: ['inapp'],
            type: 'signing.canceled',
            title: `[${rfp.code}] 전자서명이 취소됐어요`,
            body: '전자서명이 취소됐어요. 딜룸에서 다시 발송할 수 있어요.',
            linkUrl: `/rfp/${rfp.code}`,
          })),
        );
      }
    });
    emitAfterCommit(pendingEmits);
    return { ok: true };
  }

  /** 서명 대기자에게 리마인더 — ACL(양측) + SnowSign remind. */
  async remind(contractId: string, actor: Actor): Promise<ServiceResult> {
    const found = await this.signingRepo.findById(contractId);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const rfp = await this.rfpRepo.findById(found.contract.rfpId);
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    if (!found.contract.providerRef) return { ok: false, error: 'NOT_SENT' };
    try {
      await this.snowsign.remind(found.contract.providerRef);
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
    return { ok: true };
  }

  /** 재발송 — ACL(양측). 활성 계약을 취소하고 새 라운드로 다시 발송한다. */
  async resend(rfpId: string, actor: Actor): Promise<ServiceResult> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (!(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };
    const template = await this.templateRepo.findDefaultByWorkspace(bid.pgWsId);
    if (!template) return { ok: false, error: 'NO_TEMPLATE' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (active) {
      if (active.providerRef) {
        try {
          await this.snowsign.cancel(active.providerRef, '재발송');
        } catch (e) {
          logger.warn('signing.resend_cancel_failed', { contractId: active.id, err: String(e) });
        }
      }
      await this.signingRepo.patchContract(active.id, {
        status: 'canceled',
        canceledAt: new Date().toISOString(),
        cancelReason: '재발송',
      });
    }
    const all = await this.signingRepo.findByRfp(rfpId);
    const round = all.reduce((m, c) => Math.max(m, c.round), 0) + 1;
    return this.performSend(rfp, bid, template, actor, {
      contractId: randomUUID(),
      mode: 'create',
      round,
      createdBy: actor.userId,
    });
  }

  /** 딜룸 조회 — ACL(양측). 활성(없으면 최신) 계약 + 참여자 반환. */
  async getForActor(
    rfpId: string,
    actor: Actor,
  ): Promise<ServiceResult<{ contract: SigningContract; participants: SigningParticipant[] }>> {
    const active = await this.signingRepo.findActiveByRfp(rfpId);
    const latest = active ?? (await this.signingRepo.findByRfp(rfpId))[0];
    if (!latest) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    const found = await this.signingRepo.findById(latest.id);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    return { ok: true, contract: found.contract, participants: found.participants };
  }

  /**
   * 완료본/감사추적인증서 다운로드 URL — ACL(양측) + completed 게이트 + SnowSign
   * 온디맨드(1시간 URL). 로컬 보관 없음 — SnowSign 에 위임.
   */
  async getDownloadUrl(
    contractId: string,
    kind: 'document' | 'audit',
    actor: Actor,
  ): Promise<ServiceResult<{ url: string; filename?: string }>> {
    const found = await this.signingRepo.findById(contractId);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const rfp = await this.rfpRepo.findById(found.contract.rfpId);
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    if (found.contract.status !== 'completed' || !found.contract.providerRef) {
      return { ok: false, error: 'NOT_COMPLETED' };
    }
    try {
      const d =
        kind === 'audit'
          ? await this.snowsign.auditCertificateUrl(found.contract.providerRef)
          : await this.snowsign.downloadUrl(found.contract.providerRef);
      return { ok: true, url: d.downloadUrl, filename: d.filename };
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
  }

  // ─── PG 템플릿 설정 ───────────────────────────────────────────────────────

  /** template_draft Embed 세션 발급 — PG가 앱 안 iframe에서 자사 계약서를 1회 등록. */
  async createTemplateEmbedSession(
    actor: Actor,
  ): Promise<ServiceResult<{ iframeUrl: string; sessionId: string }>> {
    const origin = process.env.NEXT_PUBLIC_PARTNER_ORIGIN ?? 'http://localhost:3000';
    try {
      const s = await this.snowsign.createEmbedSession({
        purpose: 'contract_create',
        allowedOrigins: [origin],
        flows: ['template_draft'],
        externalSystem: 'supporter-b',
        externalId: `ws:${actor.workspaceId}`,
      });
      return { ok: true, iframeUrl: s.iframeUrl, sessionId: s.sessionId };
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
  }

  /** PG 워크스페이스에 링크된 서명 템플릿 목록(org 스코프). */
  async listTemplates(actor: Actor): Promise<ServiceResult<{ templates: PgSigningTemplate[] }>> {
    const templates = await this.templateRepo.findByWorkspace(actor.workspaceId);
    return { ok: true, templates };
  }

  /**
   * SnowSign 템플릿 detail 을 매핑 UI 용 중립 형태로 반환한다(역할명·변수명). 임베드
   * 등록 직후 이 PG 가 링크하려는 템플릿의 필드를 채우는 데 쓴다. actor 는 PG 세션
   * 검증용(요청 진입점 ACL); 아직 링크 전이라 org 스코프 대신 세션 게이트만 둔다.
   */
  async getTemplateDetail(
    _actor: Actor,
    snowsignTemplateId: string,
  ): Promise<
    ServiceResult<{
      name: string;
      roleNames: string[];
      variables: { name: string; label?: string; required: boolean }[];
    }>
  > {
    try {
      const d = await this.snowsign.getTemplate(snowsignTemplateId);
      return {
        ok: true,
        name: d.name,
        roleNames: d.signers.map((s) => s.roleName),
        variables: d.variables.map((v) => ({
          name: v.name,
          label: v.label,
          required: v.isRequired ?? false,
        })),
      };
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
  }

  /**
   * SnowSign 템플릿을 PG 워크스페이스에 링크(역할/변수 매핑 포함) 후, 이 PG가 낙찰한
   * awaiting 계약을 자동 발송한다. roleMapping 은 buyer·pg 양측을 모두 포함해야 한다.
   */
  async linkTemplate(
    actor: Actor,
    input: {
      snowsignTemplateId: string;
      name: string;
      roleMapping: Record<string, Party>;
      variableMapping?: Record<string, string>;
      isDefault?: boolean;
    },
  ): Promise<ServiceResult<{ templateId: string }>> {
    const sides = new Set(Object.values(input.roleMapping));
    if (!sides.has('buyer') || !sides.has('pg')) {
      return { ok: false, error: 'ROLE_MAPPING_INCOMPLETE' };
    }
    const templateId = randomUUID();
    await this.templateRepo.create({
      id: templateId,
      workspaceId: actor.workspaceId,
      snowsignTemplateId: input.snowsignTemplateId,
      name: input.name,
      roleMapping: input.roleMapping,
      variableMapping: input.variableMapping ?? {},
      isDefault: input.isDefault ?? true,
      createdBy: actor.userId,
      createdAt: new Date().toISOString(),
    });
    // 링크 직후 이 PG 낙찰 awaiting 계약을 자동 발송.
    await this.onTemplateReady(actor.workspaceId, actor);
    return { ok: true, templateId };
  }

  /**
   * 폴링(딜룸 lazy + cron)으로 SnowSign 상태를 로컬에 반영한다. 참여자 단위 상태를
   * 미러링하고 계약 상태를 전이한다. 완료는 멱등 ensureFinalized 로 위임한다.
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
      await this.signingRepo.patchContract(contractId, { lastPolledAt: new Date().toISOString() });
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
      const patch = { lastPolledAt: new Date().toISOString() } as {
        lastPolledAt: string;
        status?: SigningContractStatus;
      };
      if (nextStatus && nextStatus !== 'completed' && nextStatus !== contract.status) {
        patch.status = nextStatus;
      }
      await this.signingRepo.patchContract(contractId, patch, tx);
    });

    if (nextStatus === 'completed') {
      return this.ensureFinalized(contractId);
    }
    if ((nextStatus === 'declined' || nextStatus === 'expired') && nextStatus !== contract.status) {
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

  /** cron 폴링 드라이버 — 진행 중(sent/in_progress) 계약을 오래 안 본 순으로 동기화. */
  async pollPending(limit: number): Promise<{ polled: number }> {
    const pending = await this.signingRepo.findPollable(limit);
    let polled = 0;
    for (const c of pending) {
      await this.reconcileStatus(c.id);
      polled += 1;
    }
    return { polled };
  }

  /** 딜룸 진입 lazy 폴링 — staleMs 이상 안 봤을 때만 동기화(throttle). */
  async reconcileIfStale(contractId: string, staleMs = 30_000): Promise<void> {
    const found = await this.signingRepo.findById(contractId);
    if (!found || TERMINAL.has(found.contract.status) || !found.contract.providerRef) return;
    const last = found.contract.lastPolledAt ? new Date(found.contract.lastPolledAt).getTime() : 0;
    if (Date.now() - last < staleMs) return;
    await this.reconcileStatus(contractId);
  }

  // ─── private ────────────────────────────────────────────────────────────────

  private async performSend(
    rfp: RFP,
    bid: Bid,
    template: PgSigningTemplate,
    actor: Actor,
    opts: { contractId: string; mode: 'create' | 'update'; round: number; createdBy: string },
  ): Promise<ServiceResult> {
    const buyerSigner = await this.userRepo.findContactById(rfp.createdBy);
    const pgSigner = await this.userRepo.findContactById(bid.submittedBy);
    if (!buyerSigner || !pgSigner) return { ok: false, error: 'SIGNER_NOT_FOUND' };

    const mapped = Object.entries(template.roleMapping).map(([roleName, side]) => {
      const signer = side === 'buyer' ? buyerSigner : pgSigner;
      const userId = side === 'buyer' ? rfp.createdBy : bid.submittedBy;
      const securityMethod: 'easy_cert' | 'email' = signer.phone ? 'easy_cert' : 'email';
      return { roleName, side, signer, userId, securityMethod };
    });
    const variables = resolveVariables(template.variableMapping, buildVariableSources(rfp, bid));

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
        externalId: opts.contractId,
      });
      providerRef = created.contractId;
      await this.snowsign.sendContract(providerRef);
    } catch (e) {
      logger.error('signing.send_failed', {
        rfpId: rfp.id,
        contractId: opts.contractId,
        err: e instanceof SnowSignError ? e.code : String(e),
      });
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }

    const now = new Date();
    const participants: SigningParticipant[] = mapped.map((m) => ({
      id: randomUUID(),
      contractId: opts.contractId,
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
      if (opts.mode === 'create') {
        await this.signingRepo.create(
          {
            id: opts.contractId,
            rfpId: rfp.id,
            providerRef,
            snowsignTemplateId: template.snowsignTemplateId,
            status: 'sent',
            round: opts.round,
            createdBy: opts.createdBy,
            createdAt: now.toISOString(),
            sentAt: now.toISOString(),
          },
          participants,
          tx,
        );
      } else {
        await this.signingRepo.patchContract(
          opts.contractId,
          {
            providerRef,
            snowsignTemplateId: template.snowsignTemplateId,
            status: 'sent',
            sentAt: now.toISOString(),
          },
          tx,
        );
        await this.signingRepo.insertParticipants(participants, tx);
      }
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'signing.sent',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { contractId: opts.contractId, providerRef },
        },
        tx,
      );
      for (const rcpt of await this.bothPartyRecipients(rfp, bid.pgWsId, tx)) {
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

  private async notifyTerminal(rfpId: string, status: 'declined' | 'expired'): Promise<void> {
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

  private async resolvePartyByRfp(rfp: RFP, actor: Actor): Promise<Party | null> {
    if (rfp.buyerWsId === actor.workspaceId) return 'buyer';
    if (rfp.awardedBidId) {
      const bid = await this.bidRepo.findById(rfp.awardedBidId);
      if (bid?.pgWsId === actor.workspaceId) return 'pg';
    }
    return null;
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
