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
import { captureSigningError } from '@/lib/server/signing/observability';
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

// 알려진 non-terminal(무시해도 되는) provider status — 미지값 경고에서 제외.
const KNOWN_NOOP_PROVIDER_STATUSES = new Set(['draft', 'pending', 'sent']);

function mapProviderContractStatus(s: string): SigningContractStatus | undefined {
  // 대소문자·공백 변형('COMPLETED', ' Completed ')도 인식한다. synonym 추정은 하지
  // 않는다(계약 완료는 금융 행위 — 임의 매핑 위험). 정규화만 한다.
  switch (s.trim().toLowerCase()) {
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
      return undefined; // draft/pending/sent 등 — 변화 없음
  }
}

// 참여자 상태 단조 순위(역행 방지). rejected 는 signed 와 동급의 종결 상태.
const PARTICIPANT_RANK: Record<SigningParticipantStatus, number> = {
  pending: 0,
  viewed: 1,
  signed: 2,
  rejected: 2,
};
const FINAL_PARTICIPANT_STATUSES = new Set<SigningParticipantStatus>(['signed', 'rejected']);

function mapProviderParticipantStatus(s: string): SigningParticipantStatus | undefined {
  // 대소문자 정규화 + 미지값은 undefined(변화 없음) — 강제 'pending' 으로 이미 서명·열람한
  // 참여자를 되돌리지 않는다.
  switch (s.trim().toLowerCase()) {
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
    const sent = await this.performSend(rfp, bid, template, actor, {
      contractId,
      mode: 'create',
      round: 1,
      createdBy: actor.userId,
    });
    // SnowSign 발송 실패(다운 등)면 서명 행이 아예 안 생겨 buyer 가 아무 표시도 못 받는
    // dead-end 가 된다 — send_failed 로 기록해 딜룸에 '다시 시작'을 노출하고 buyer 에게
    // 알린다(U3). resend 가 새 라운드로 복구한다.
    if (!sent.ok) {
      // best-effort — 기록 자체가 실패해도(예: 로컬 DB 장애가 PERSIST_FAILED 와 함께 온
      // 경우) onAward 결과(performSend 결과)를 바꾸지 않는다.
      try {
        await this.persistSendFailed(contractId, rfp, actor);
      } catch (e) {
        logger.error('signing.start_failed_persist_failed', { rfpId: rfp.id, err: String(e) });
        captureSigningError('signing.start_failed_persist_failed', e, {
          contractId,
          rfpCode: rfp.code,
        });
      }
    }
    return sent;
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

    // 원자 클레임 먼저 — 활성일 때만 canceled 로 전이한다. 완료 웹훅/폴링과 경쟁해도
    // 완료본을 덮어쓰지 않는다(이미 종결이면 no-op·멱등, 알림·감사 없음). resend/reconcile
    // 과 동일한 CAS 경로.
    const claimed = await this.signingRepo.transitionIfActive(contractId, 'canceled', new Date(), {
      cancelReason: reason,
    });
    if (!claimed) return { ok: true };

    if (found.contract.providerRef) {
      try {
        await this.snowsign.cancel(found.contract.providerRef, reason);
      } catch (e) {
        logger.warn('signing.cancel_provider_failed', { contractId, err: String(e) });
        captureSigningError('signing.cancel_provider_failed', e, {
          contractId,
          providerRef: found.contract.providerRef,
        });
      }
    }

    const pgWsId = rfp.awardedBidId
      ? (await this.bidRepo.findById(rfp.awardedBidId))?.pgWsId
      : undefined;
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      // 상태 전이는 위 원자 클레임에서 이미 완료 — tx 는 감사·알림만 수행한다.
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
      // 원자 클레임 — 활성일 때만 canceled 로 전이한다. 동시 resend(양측 버튼·다중 탭)나
      // 직전에 도착한 완료 웹훅과 경쟁하면 하나만 성공한다. 실패하면(이미 종결됐거나 다른
      // resend 가 선점) 새 SnowSign 계약을 만들지 않고 중단해 이중 발송·완료본 클로버를 막는다.
      const claimed = await this.signingRepo.transitionIfActive(active.id, 'canceled', new Date(), {
        cancelReason: '재발송',
      });
      if (!claimed) return { ok: false, error: 'CONTRACT_BUSY' };
      if (active.providerRef) {
        try {
          await this.snowsign.cancel(active.providerRef, '재발송');
        } catch (e) {
          logger.warn('signing.resend_cancel_failed', { contractId: active.id, err: String(e) });
          captureSigningError('signing.resend_cancel_failed', e, {
            contractId: active.id,
            providerRef: active.providerRef,
          });
        }
      }
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
    // ACL 먼저 — 존재 여부(CONTRACT_NOT_FOUND)를 노출하기 전에 당사자인지 확인한다.
    // 비당사자(비초대 PG 등)가 404/FORBIDDEN 차이로 award·서명 개시 여부를 추론하는
    // 오라클을 막는다.
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    const active = await this.signingRepo.findActiveByRfp(rfpId);
    const latest = active ?? (await this.signingRepo.findByRfp(rfpId))[0];
    if (!latest) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
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
    actor: Actor,
    snowsignTemplateId: string,
  ): Promise<
    ServiceResult<{
      name: string;
      roleNames: string[];
      variables: { name: string; label?: string; required: boolean }[];
    }>
  > {
    // org 스코핑: 이미 다른 워크스페이스가 링크한 템플릿이면 조회 거부(크로스-테넌트
    // 메타데이터 유출 방지). 아직 링크 전(방금 이 PG 가 임베드로 만든 신규분)은 허용한다.
    // 잔여 갭(미링크 템플릿의 첫 조회를 소유자로 검증) = SnowSign getTemplate 이 임베드
    // 세션 external_id(ws:<id>)를 돌려주는지 Phase 11 샌드박스에서 확인 후 닫는다.
    const owner = await this.templateRepo.findBySnowsignTemplateId(snowsignTemplateId);
    if (owner && owner.workspaceId !== actor.workspaceId) {
      return { ok: false, error: 'FORBIDDEN' };
    }
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
    // 크로스-테넌트 링크 가드: 다른 워크스페이스가 이미 링크한 SnowSign 템플릿은 거부한다
    // (타 PG 계약서를 자기 기본 템플릿으로 등록해 award 시 그 문서로 계약을 생성하는 것 방지).
    const owner = await this.templateRepo.findBySnowsignTemplateId(input.snowsignTemplateId);
    if (owner && owner.workspaceId !== actor.workspaceId) {
      return { ok: false, error: 'TEMPLATE_ALREADY_LINKED' };
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
    if (
      nextStatus === undefined &&
      !KNOWN_NOOP_PROVIDER_STATUSES.has(detail.status.trim().toLowerCase())
    ) {
      // 진짜 미지 status(제공자 신규 상태·오탈자 변형) — 매핑되지 않아 무한 정체할 수
      // 있으므로 조용히 남기지 않고 관측에 노출한다(폴 경로는 Axiom 만, Sentry 제외).
      logger.warn('signing.unknown_provider_status', { contractId, status: detail.status });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      for (const pp of detail.participants) {
        // 이메일은 대소문자 무시로 매칭 — 제공자가 정규화(소문자화)해 돌려줘도 참여자
        // 상태 미러링이 어긋나지 않도록.
        const local = participants.find(
          (lp) => lp.email.toLowerCase() === pp.email.toLowerCase(),
        );
        const mapped = mapProviderParticipantStatus(pp.status);
        // 단조 전이만 반영: 미지값(undefined)·이미 종결(signed/rejected)·역행(순위 하락)은
        // 무시해 비정상/재전송 스냅샷이 이미 서명한 참여자를 pending 으로 되돌리지 못하게 한다.
        if (
          local &&
          mapped &&
          mapped !== local.status &&
          !FINAL_PARTICIPANT_STATUSES.has(local.status) &&
          PARTICIPANT_RANK[mapped] >= PARTICIPANT_RANK[local.status]
        ) {
          await this.signingRepo.patchParticipant(
            local.id,
            { status: mapped, signedAt: pp.signedAt ?? undefined },
            tx,
          );
        }
      }
      const patch = { lastPolledAt: new Date().toISOString() } as {
        lastPolledAt: string;
        status?: SigningContractStatus;
      };
      // 비종결(in_progress) 전이만 여기서 패치한다. 종결(completed/declined/expired)은
      // 아래에서 원자 CAS(finalizeIfNotFinal / transitionIfActive)로 처리해 동시 폴링·웹훅
      // 중복 완료/알림을 막는다.
      if (nextStatus === 'in_progress' && nextStatus !== contract.status) {
        patch.status = 'in_progress';
      }
      await this.signingRepo.patchContract(contractId, patch, tx);
    });

    if (nextStatus === 'completed') {
      return this.ensureFinalized(contractId);
    }
    if (nextStatus === 'declined' || nextStatus === 'expired') {
      // 활성→종결 원자 전이. 실제로 전이한 호출자만 알림을 보낸다(멱등 — 동시 reconcile
      // 이 stale 스냅샷으로 양쪽 다 알림을 보내던 문제 제거).
      const transitioned = await this.signingRepo.transitionIfActive(
        contractId,
        nextStatus,
        new Date(),
      );
      if (transitioned) await this.notifyTerminal(contract.rfpId, nextStatus);
    }
    if (nextStatus === 'canceled') {
      // 제공자 측 외부 취소(SnowSign 콘솔 등)를 로컬에도 반영해 폴링을 멈춘다. 앱 자체
      // 취소(cancel())는 별도로 알림을 보내므로 여기선 상태 전이만 한다(원자, 멱등).
      await this.signingRepo.transitionIfActive(contractId, 'canceled', new Date(), {
        cancelReason: '제공자 측 취소',
      });
    }
    return { ok: true };
  }

  /** 멱등 완료 진입점 — 실제 전이한 경우에만 감사·알림. 중복 폴링 안전. */
  async ensureFinalized(contractId: string): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    // CAS 를 감사·알림과 같은 tx 로 묶는다 — 알림/감사 영속이 실패하면 completed 전이도
    // 함께 롤백돼 다음 폴링이 깨끗이 재시도한다(완료 알림 영구 유실 방지). 동시 완료 이중
    // 알림은 finalizeIfNotFinal 의 `WHERE status NOT IN (terminal) RETURNING` 행-락 재평가로
    // 여전히 한 tx 만 통과한다(멱등 보존).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      const transitioned = await this.signingRepo.finalizeIfNotFinal(contractId, new Date(), tx);
      if (!transitioned) return;
      const found = await this.signingRepo.findById(contractId, tx);
      if (!found) return;
      // tx 안 조회는 반드시 tx 를 전달한다(PGlite 단일 커넥션 데드락 방지).
      const rfp = await this.rfpRepo.findById(found.contract.rfpId, tx);
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
      try {
        await this.reconcileStatus(c.id);
      } catch (e) {
        // 한 계약의 예기치 않은 throw(비정상값이 tx 안에서 TypeError 등)가 배치 전체를
        // 무너뜨리지 않도록 격리한다. lastPolledAt 를 전진시켜(findPollable = asc nulls
        // first) 실패한 계약이 큐 선두에 고착(starvation)돼 나머지를 굶기지 않게 한다.
        logger.error('signing.poll_item_failed', { contractId: c.id, err: String(e) });
        try {
          await this.signingRepo.patchContract(c.id, { lastPolledAt: new Date().toISOString() });
        } catch (pe) {
          logger.error('signing.poll_mark_failed', { contractId: c.id, err: String(pe) });
        }
      }
      polled += 1;
    }
    return { polled };
  }

  /**
   * 오래 방치된 awaiting_pg_template 계약의 PG 에게 서명 템플릿 설정을 재넛지한다. 기본
   * 7일 스로틀(lastPolledAt 마커) — 방치된 딜(buyer 화면에 "PG사가 계약서 준비 중"으로
   * 무기한 표시)이 조용히 dead-end 로 남지 않도록 cron 이 주기 호출한다. 재넛지한 계약 수 반환.
   */
  async nudgeStaleAwaiting(
    olderThanMs = 7 * 24 * 60 * 60 * 1000,
    limit = 50,
  ): Promise<{ nudged: number }> {
    const nudgeBefore = new Date(Date.now() - olderThanMs);
    const stale = await this.signingRepo.findStaleAwaiting(nudgeBefore, limit);
    let nudged = 0;
    for (const c of stale) {
      const rfp = await this.rfpRepo.findById(c.rfpId);
      if (!rfp?.awardedBidId) continue;
      const bid = await this.bidRepo.findById(rfp.awardedBidId);
      if (!bid) continue;
      const pendingEmits: Notification[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._db.transaction(async (tx: any) => {
        const pgMembers = await this.workspaceRepo.approvedMemberRecipients(bid.pgWsId, tx);
        for (const m of pgMembers) {
          pendingEmits.push(
            ...(await notify(tx, {
              recipients: [{ userId: m.userId, workspaceId: bid.pgWsId, email: m.email }],
              channels: ['inapp'],
              type: 'signing.awaiting_template',
              title: `[${rfp.code}] 계약서 서명 템플릿을 설정해 주세요`,
              body: '선정된 견적의 전자서명을 진행하려면 서명 템플릿을 먼저 설정해 주세요.',
              linkUrl: `/inbox/${rfp.code}`,
            })),
          );
        }
        // 재넛지 스로틀 마커(awaiting 은 폴링 대상이 아니라 lastPolledAt 재사용).
        await this.signingRepo.patchContract(c.id, { lastPolledAt: new Date().toISOString() }, tx);
      });
      emitAfterCommit(pendingEmits);
      nudged += 1;
    }
    return { nudged };
  }

  /** 딜룸 진입 lazy 폴링 — staleMs 이상 안 봤을 때만 동기화(throttle). */
  async reconcileIfStale(contractId: string, staleMs = 30_000): Promise<void> {
    const found = await this.signingRepo.findById(contractId);
    if (!found || TERMINAL.has(found.contract.status) || !found.contract.providerRef) return;
    const last = found.contract.lastPolledAt ? new Date(found.contract.lastPolledAt).getTime() : 0;
    if (Date.now() - last < staleMs) return;
    await this.reconcileStatus(contractId);
  }

  /**
   * SnowSign 웹훅 트리거 — provider_ref(SnowSign contract_id)로 로컬 계약을 찾아
   * reconcileStatus 로 위임한다. 웹훅은 상태 소스가 아니라 저지연 폴링 트리거이므로
   * payload 본문을 신뢰하지 않고 getContract 로 재조회한다(상태 매핑 단일 경로 유지).
   * 추적하지 않는 ref 는 멱등 ack(ok) — SnowSign 재전송 로그를 남기지 않는다.
   */
  async reconcileByProviderRef(providerRef: string): Promise<ServiceResult> {
    const contract = await this.signingRepo.findByProviderRef(providerRef);
    if (!contract) return { ok: true };
    return this.reconcileStatus(contract.id);
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

    let providerRef: string | undefined;
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
      // create 는 성공했는데 send 가 실패하면 발송 안 된 draft 가 SnowSign 에 남는다 —
      // 보상 취소해 고아 draft 를 남기지 않는다(발송 전이라 메일·라이브 계약은 없음).
      if (providerRef) {
        try {
          await this.snowsign.cancel(providerRef, 'send failed');
        } catch (ce) {
          logger.error('signing.orphan_cancel_failed', { providerRef, err: String(ce) });
          captureSigningError('signing.orphan_cancel_failed', ce, {
            contractId: opts.contractId,
            providerRef,
          });
        }
      }
      logger.error('signing.send_failed', {
        rfpId: rfp.id,
        contractId: opts.contractId,
        err: e instanceof SnowSignError ? e.code : String(e),
      });
      captureSigningError('signing.send_failed', e, {
        contractId: opts.contractId,
        providerRef,
        rfpCode: rfp.code,
      });
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
    // providerRef 는 위에서 반드시 세팅됨(실패 시 catch 가 return) — 타입 좁히기.
    if (!providerRef) return { ok: false, error: 'SNOWSIGN_ERROR' };

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
    let result: ServiceResult;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await this._db.transaction(async (tx: any) => {
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
    } catch (e) {
      // 발송(SnowSign)은 됐으나 로컬 영속이 실패 → 이미 발송된 계약을 보상 취소해 고아
      // (추적·복구 불가한 라이브 계약 + 재시도 시 새 external_id 로 이중 발송)를 남기지 않는다.
      try {
        await this.snowsign.cancel(providerRef, 'local persist failed');
      } catch (ce) {
        logger.error('signing.orphan_cancel_failed', { providerRef, err: String(ce) });
        captureSigningError('signing.orphan_cancel_failed', ce, {
          contractId: opts.contractId,
          providerRef,
        });
      }
      logger.error('signing.persist_failed_after_send', {
        contractId: opts.contractId,
        providerRef,
        err: String(e),
      });
      captureSigningError('signing.persist_failed_after_send', e, {
        contractId: opts.contractId,
        providerRef,
        rfpCode: rfp.code,
      });
      return { ok: false, error: 'PERSIST_FAILED' };
    }

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
   * award 시 SnowSign 발송이 전면 실패하면 send_failed 로 기록한다(providerRef 없음 —
   * 라이브 계약 없음). 딜룸은 이 행을 latest 로 보여주며 '다시 시작'(resend)을 노출하고,
   * buyer 는 인앱 알림으로 상황을 안다(무-표시 dead-end 방지, U3).
   */
  private async persistSendFailed(contractId: string, rfp: RFP, actor: Actor): Promise<void> {
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.signingRepo.create(
        {
          id: contractId,
          rfpId: rfp.id,
          status: 'send_failed',
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
          action: 'signing.start_failed',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { contractId },
        },
        tx,
      );
      const buyerMembers = await this.workspaceRepo.approvedMemberRecipients(rfp.buyerWsId, tx);
      for (const m of buyerMembers) {
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [{ userId: m.userId, workspaceId: rfp.buyerWsId, email: m.email }],
            channels: ['inapp'],
            type: 'signing.start_failed',
            title: `[${rfp.code}] 전자서명을 시작하지 못했어요`,
            body: '전자서명 서비스에 연결하지 못했어요. 딜룸에서 다시 시작할 수 있어요.',
            linkUrl: `/rfp/${rfp.code}`,
          })),
        );
      }
    });
    emitAfterCommit(pendingEmits);
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
