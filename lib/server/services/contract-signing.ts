import type { AgreementDraftLookupRepo } from '@/lib/server/repositories/types';
import {
  participantsMatchDeal,
  isDispatchedProviderStatus,
  mapProviderContractStatus,
  resolveSigningParty,
  auditSigningBestEffort,
} from './signing-policy';
import { SigningDispatch } from './signing-dispatch';
import { SigningRecovery } from './signing-recovery';
import { SigningReconciliation } from './signing-reconciliation';
export { SIGNING_RECOVERY_DEADLINE_MS, RECOVERY_MAX_DETAIL_LOOKUPS } from './signing-recovery';
import { defineAsyncSingleton } from '@/lib/server/_singleton';
import { getAgreementService, type AgreementService } from './agreement';
import { getAgreementRepo } from '@/lib/server/repositories/factory';
import { requiresCommonAgreement } from '@/lib/server/signing/agreement-boundary';
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
import { notifySigningOperator } from '@/lib/server/notifications/operator-signing';
import { logger } from '@/lib/observability/logger';
import { appOrigins } from '@/lib/site-routing';
import { REMINDABLE_STATUSES, REMIND_COOLDOWN_MS, REMIND_RATE_LIMIT_BACKOFF_MS } from '@/lib/signing/remind-cooldown';
import { STALE_SENT_AFTER_MS, STALE_SENT_REALERT_MS } from '@/lib/signing/stale-sent';
import {
  EXTERNAL_SYSTEM,
  SnowSignError,
  type SnowSignClient,
  type SnowSignContractDetail,
} from '@/lib/server/signing/snowsign-client';
import { captureSigningError } from '@/lib/server/signing/observability';
import type { RFP } from '@/lib/types/rfp';
import type { Notification } from '@/lib/types/notification';
import type {
  SigningContract,
  SigningParticipant,
} from '@/lib/types/signing';
import { baseUrlFor } from '@/lib/server/env';
import { renderSigningAwaitingTemplate } from '@/lib/server/outbox/templates/signingAwaitingTemplate';
import type { Actor, ServiceResult } from './types';
import { ContractDispatch } from './contract-dispatch';
import { SigningSendLease } from './signing-send-lease';
import { SigningSentCommit } from './signing-sent-commit';
import { signingPartyLink, signingPartyRecipients } from './signing-party-notifications';
import { pgDealRoomLink } from '@/lib/rfp/pg-deal-room-link';

export type { Actor, ServiceResult };

// remind 실패의 쿨다운 처리는 "요청이 공급자에 닿았는가"로 가른다. 두 집합 밖의
// 코드(NETWORK/MALFORMED/ERROR 등)는 이미 나갔을 수 있어 24h 클레임을 유지한다.
//
// 닿지 않음 — 요청이 나가지 않았고 공급자 한도도 쓰지 않았다. 클레임을 되돌린다.
const REMIND_NOT_SENT_CODES = new Set(['SNOWSIGN_NO_KEY', 'SNOWSIGN_UNREACHABLE']);
// 닿았지만 거절 — 안 나간 것은 확실해도 되돌리면 즉시 재시도가 같은 거절을 다시 받아
// 조직 공유 한도를 태우는 루프가 된다(429 는 포화 순간 쿨다운이 꺼지고, 404 는 공급자
// 계약이 사라져도 reconcile 이 상태를 안 바꿔 끝나지 않는다). 짧은 백오프로 줄인다.
const REMIND_REJECTED_CODES = new Set([
  'SNOWSIGN_RATE_LIMIT',
  'SNOWSIGN_INVALID_KEY',
  'SNOWSIGN_VALIDATION',
  'SNOWSIGN_NOT_FOUND',
  'SNOWSIGN_INVALID_STATUS',
]);

// 리마인더가 의미 있는 상태 — 발송됐고 아직 종결되지 않은 계약. cancel/resend 가
// `transitionIfActive` 로 종결 계약에서 no-op 인 것과 짝을 맞춘다.
const REMINDABLE = new Set(REMINDABLE_STATUSES);

/**
 * 임베드 세션의 `external_id` — `sc:<signingContractId>:<nonce>`.
 *
 * 두 가지를 동시에 만족해야 한다. ① **세션마다 유니크**: 스노우싸인이
 * `external_system + external_id` 로 임베드 세션 중복을 막기 때문에(409
 * `EMBED_SESSION_ALREADY_ACTIVE`), 계약 id 를 그대로 쓰면 닫았다 다시 열 때
 * 막힌다(실사용에서 드러남). ② **어느 계약인지 식별**: 생성된 계약이 우리 것인지
 * 사후에 검증해야 한다(`attachProviderContract`). 그래서 계약 id 를 접두어로 두고
 * nonce 를 뒤에 붙인다.
 */
function embedExternalId(contractId: string): string {
  return `sc:${contractId}:${randomUUID()}`;
}

/**
 * 회신된 `external_id` 가 이 계약을 가리키는가.
 *
 * nonce 형태(`sc:<id>:<nonce>`)와 nonce 도입 이전에 만들어진 형태(`sc:<id>`)를 모두
 * 받는다. 접두어 검사여도 강도는 정확일치와 같다 — 남이 이 값을 위조하려면 우리
 * 서버를 통해 세션을 만들어야 하는데, 그 경로가 이미 ACL 로 막혀 있다.
 */
function matchesEmbedExternalId(externalId: string, contractId: string): boolean {
  return externalId === `sc:${contractId}` || externalId.startsWith(`sc:${contractId}:`);
}

/**
 * 구매사에게 나갈 계약 행에서 provider 측 식별자를 벗긴다.
 *
 * `providerRef`(SnowSign 계약 id)로는 구매사가 PG 의 계약 문서를 조회할 수 있다.
 * `snowsignTemplateId` 는 PG 가 어떤 계약서를 썼는지 드러내므로 함께 벗긴다. **더 이상
 * 이력 컬럼이 아니다** — 템플릿 경로가 초안 생성 시 `bindDraftRef` 로 판본을 채우고,
 * 재사용 게이트가 그 값을 "지금 연결된 템플릿과 같은 판인가"로 쓴다(옛 판 PDF 발송 차단).
 * 즉 신규 발송에도 채워지므로 벗기는 것이 전보다 더 중요해졌다.
 * 어느 구매사 화면도 두 값을 읽지 않는다. 경계 소유자는 **이 서비스** 한 곳이다 —
 * 로더가 따로 벗기면 새 호출자가 생길 때 조용히 빠진다.
 *
 * `providerDraftOrigin` 은 여기 없다 — `SigningContract` 도메인 타입에 얹지 않고 좁은
 * `findDraftRef` 로만 읽으므로(`findSigningTemplateId` 선례) 구매사 페이로드에 실릴
 * 경로 자체가 없다. 도메인 타입에 얹는 순간 이 목록에 추가해야 한다.
 */
export function stripProviderRefs(contract: SigningContract): SigningContract {
  const { snowsignTemplateId: _t, providerRef: _p, ...rest } = contract;
  return rest;
}

/**
 * (#2) 스윕 최근성 창 — onAward 유실은 초 단위 사고라 짧아도 되지만, cron 정지 등
 * 운영 사고를 흡수하도록 48시간을 준다. 창이 없으면 서명 기능 이전에 낙찰된 옛 딜
 * 전부가 첫 배포일에 "고아"로 재생성돼 알림이 쏟아진다.
 */
const SWEEP_RECENCY_MS = 48 * 60 * 60 * 1000;

export class ContractSigningService {
  private readonly sendLease: SigningSendLease;
  private readonly sentCommit: SigningSentCommit;
  private readonly contractDispatch: ContractDispatch;
  private readonly dispatch: SigningDispatch;
  private readonly recovery: SigningRecovery;
  private readonly reconciliation: SigningReconciliation;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly signingRepo: SigningContractRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly bidRepo: BidRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly snowsign: SnowSignClient,
    templateRepo: PgSigningTemplateRepo,
    agreementService: AgreementService,
    private readonly agreementRepo: AgreementDraftLookupRepo,
    createArchivePending: (contractId: string) => Promise<ServiceResult>,
  ) {
    this.sendLease = new SigningSendLease({
      signingRepo,
      db: _db,
      workspaceRepo,
      auditRepo,
    });
    this.sentCommit = new SigningSentCommit(_db, signingRepo, auditRepo, workspaceRepo, userRepo);
    this.reconciliation = new SigningReconciliation({
      _db,
      signingRepo,
      rfpRepo,
      bidRepo,
      workspaceRepo,
      auditRepo,
      snowsign,
      agreementRepo,
      sentCommit: this.sentCommit,
      createArchivePending,
    });
    this.dispatch = new SigningDispatch({
      signingRepo,
      bidRepo,
      userRepo,
      workspaceRepo,
      snowsign,
      templateRepo,
      agreementService,
      sendLease: this.sendLease,
      sentCommit: this.sentCommit,
      reconciliation: this.reconciliation,
    });
    this.recovery = new SigningRecovery({
      signingRepo,
      rfpRepo,
      bidRepo,
      userRepo,
      workspaceRepo,
      snowsign,
      agreementRepo,
      sendLease: this.sendLease,
    });
    this.contractDispatch = new ContractDispatch({
      agreementRepo,
      rfpRepo,
      signingRepo,
      bidRepo,
      templateRepo,
      resolveParty: (rfp, actor) => this.resolvePartyByRfp(rfp, actor),
      adapters: {
        template: (context) => this.dispatch.dispatchTemplate(context),
        compose: (context) => this.dispatch.dispatchComposed(context),
        agreement: (context) => this.dispatch.dispatchComposed(context),
      },
    });
  }

  async sendFromTemplate(
    rfpId: string,
    actor: Actor,
    opts?: { takeOver?: boolean },
  ): Promise<ServiceResult> {
    return this.contractDispatch.dispatch({
      source: 'template',
      rfpId,
      actor,
      takeOver: opts?.takeOver,
    });
  }

  async sendAgreement(contractId: string, actor: Actor, stamp: string): Promise<ServiceResult> {
    return this.contractDispatch.dispatch({
      source: 'agreement',
      contractId,
      actor,
      stamp,
    });
  }

  async sendComposedContract(
    rfpId: string,
    actor: Actor,
    opts?: { takeOver?: boolean },
  ): Promise<ServiceResult> {
    return this.contractDispatch.dispatch({
      source: 'compose',
      rfpId,
      actor,
      takeOver: opts?.takeOver,
    });
  }

  /**
   * award 커밋 후 호출(action 오케스트레이션). **항상** awaiting_pg_template 로 기록하고
   * PG 에게 발송을 요청한다 — 자동 발송은 없다. 계약서 PDF 는 PG 가 딜룸의 스노우싸인
   * 임베드에서 직접 올리고 서명칸을 배치해 보낸다(`createSendEmbedSession` →
   * `attachProviderContract`).
   * 활성 계약이 이미 있으면 no-op(멱등).
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

    return this.persistAwaiting(randomUUID(), rfp, bid.pgWsId, actor, 1);
  }

  /** 참여자 취소 — ACL(양측) + SnowSign cancel 전파 + 로컬 canceled + 감사·알림. */
  async cancel(contractId: string, actor: Actor, reason?: string): Promise<ServiceResult> {
    const found = await this.signingRepo.findById(contractId);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const rfp = await this.rfpRepo.findById(found.contract.rfpId);
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor)))
      return { ok: false, error: 'FORBIDDEN' };

    // 원자 클레임 먼저 — 활성일 때만 canceled 로 전이한다. 완료 웹훅/폴링과 경쟁해도
    // 완료본을 덮어쓰지 않는다(이미 종결이면 no-op·멱등, 알림·감사 없음). resend/reconcile
    // 과 동일한 CAS 경로.
    const claimed = await this.signingRepo.transitionIfActive(contractId, 'canceled', new Date(), {
      cancelReason: reason,
    });
    if (!claimed) return { ok: true };

    // providerRef 는 CAS **이후에** 다시 읽는다. `markSentIfAwaiting` 이 providerRef 와
    // status='sent' 를 함께 쓰므로, awaiting 일 때 뜬 스냅샷은 providerRef 가 비어 있다 —
    // 그 스냅샷을 믿으면 발송이 그 사이 커밋된 경우 로컬만 canceled 로 바뀌고 살아있는
    // SnowSign 계약은 취소되지 않아 고아로 남는다.
    const providerRef = (await this.signingRepo.findById(contractId))?.contract.providerRef;
    if (providerRef) {
      try {
        await this.snowsign.cancel(providerRef, reason);
      } catch (e) {
        logger.warn('signing.cancel_provider_failed', {
          contractId,
          err: String(e),
        });
        captureSigningError('signing.cancel_provider_failed', e, {
          contractId,
          providerRef,
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
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: await signingPartyRecipients(this.workspaceRepo, rfp, pgWsId, tx),
          channels: ['inapp'],
          type: 'signing.canceled',
          title: `[${rfp.code}] 전자서명이 취소됐어요`,
          body: '전자서명이 취소됐어요. 딜룸에서 다시 발송할 수 있어요.',
          linkUrl: (rcpt) => signingPartyLink(rcpt, rfp),
        })),
      );
    });
    emitAfterCommit(pendingEmits);
    void notifySigningOperator({
      event: 'canceled',
      rfpCode: rfp.code,
      rfpTitle: rfp.title,
      round: found.contract.round,
    });
    return { ok: true };
  }

  /** 서명 대기자에게 리마인더 — ACL(양측) + 24h 쿨다운(CAS) + SnowSign remind. */
  async remind(contractId: string, actor: Actor): Promise<ServiceResult> {
    const found = await this.signingRepo.findById(contractId);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const rfp = await this.rfpRepo.findById(found.contract.rfpId);
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor)))
      return { ok: false, error: 'FORBIDDEN' };
    if (!found.contract.providerRef) return { ok: false, error: 'NOT_SENT' };
    // 상태 게이트가 공급자 호출·클레임보다 먼저다. 없으면 종결 계약의 400
    // INVALID_CONTRACT_STATUS 가 "안 나갔다"로 클레임을 반납해 쿨다운이 매번 풀리고,
    // 당사자 한 명이 조직 공유 한도를 상시 포화시킬 수 있었다. 화면은 sent/in_progress
    // 에서만 버튼을 띄우므로 여기 오는 요청은 낡은 화면이다.
    if (!REMINDABLE.has(found.contract.status)) return { ok: false, error: 'CONTRACT_CHANGED' };
    // 쿨다운은 계약 행의 원자 클레임(CAS)이다 — read-then-act 로 하면 판정과 기록
    // 사이에 provider 왕복이 끼어 병렬 요청 N개가 전부 통과한다(연타·양측 클릭은
    // 물론, 인증된 당사자가 고의로 병렬 호출해 상대 메일함과 조직 공유 rate limit
    // 을 태우는 경로까지). 클레임 먼저 → 발송, 실패하면 공급자에 닿았는지에 따라
    // 반납·백오프·유지 셋 중 하나(아래 두 코드 집합).
    const now = new Date();
    const claimed = await this.signingRepo.claimRemind(
      contractId,
      now,
      new Date(now.getTime() - REMIND_COOLDOWN_MS),
    );
    if (!claimed) {
      const current = await this.signingRepo.findById(contractId);
      if (!current || !REMINDABLE.has(current.contract.status)) {
        return { ok: false, error: 'CONTRACT_CHANGED' };
      }
      return { ok: false, error: 'REMIND_COOLDOWN' };
    }
    try {
      await this.snowsign.remind(found.contract.providerRef);
    } catch (e) {
      const code = e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR';
      // 5xx·네트워크·형태 불명은 provider 가 이미 리마인더를 보냈을 수 있는 모호
      // 상태라 클레임을 유지한다 — 되돌리면 에러 문구의 "다시 시도"가 곧 이중
      // 리마인더가 된다(HTTP 계층에서 재시도를 끈 것과 같은 이유). 전용 문구로
      // 안내한다(REMIND_UNCONFIRMED — 비용은 확인 못 한 리마인더 1회의 24h 대기).
      const rewindTo = REMIND_NOT_SENT_CODES.has(code)
        ? null
        : REMIND_REJECTED_CODES.has(code)
          ? new Date(now.getTime() + REMIND_RATE_LIMIT_BACKOFF_MS - REMIND_COOLDOWN_MS)
          : undefined;
      if (rewindTo === undefined) return { ok: false, error: 'REMIND_UNCONFIRMED' };
      // 정확일치 CAS 라 그 사이 성립한 다른 클레임은 건드리지 않는다. 실패는 다음
      // 시도가 24h 를 기다리게 만들 뿐이라(보수적) warn 으로만 남긴다.
      try {
        await this.signingRepo.rewindRemindClaim(contractId, now, rewindTo);
      } catch (re) {
        logger.warn('signing.remind_claim_rewind_failed', {
          contractId,
          err: String(re),
        });
      }
      return { ok: false, error: code };
    }
    // 감사 로그는 기록일 뿐 쿨다운 판정 근거가 아니다 — 기록이 실패해도 클레임이
    // 이미 서 있어 쿨다운은 유효하다(best-effort).
    await this.auditBestEffort(
      {
        actorUserId: actor.userId,
        actorWorkspaceId: actor.workspaceId,
        action: 'signing.reminded',
        entityType: 'rfp',
        entityId: rfp.code,
        metadata: { contractId },
      },
      'signing.reminded_audit_failed',
    );
    return { ok: true };
  }
  private auditBestEffort(entry: Parameters<AuditLogRepo['insert']>[0], logKey: string) {
    return auditSigningBestEffort(this.auditRepo, entry, logKey);
  }

  /**
   * 재발송 — ACL(양측). 활성 계약을 취소하고 새 라운드를 **대기 상태로** 연다.
   *
   * 직전 계약서를 재사용하지 않는다. 계약서 PDF 와 서명칸 배치는 스노우싸인 임베드
   * 안에만 있고 우리는 그 사본을 갖고 있지 않기 때문이다 — 재발송은 곧 PG 가 임베드를
   * 다시 열어 계약서를 올린다는 뜻이다. 구매사가 눌러도 마찬가지라 dead-end 는 없다.
   *
   * 항상 아무것도 발송하지 않으므로 `degraded: true` 가 늘 실린다(호출자가 '다시
   * 보냈어요' 라고 말하지 않도록). 템플릿 시절엔 이게 예외 경로였지만 지금은 유일한 경로다.
   */
  async resend(rfpId: string, actor: Actor): Promise<ServiceResult<{ degraded?: boolean }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (!(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (active) {
      // 원자 클레임 — 활성일 때만 canceled 로 전이한다. 동시 resend(양측 버튼·다중 탭)나
      // 직전에 도착한 완료 웹훅과 경쟁하면 하나만 성공한다. 실패하면(이미 종결됐거나 다른
      // resend 가 선점) 새 SnowSign 계약을 만들지 않고 중단해 이중 발송·완료본 클로버를 막는다.
      const claimed = await this.signingRepo.transitionIfActive(active.id, 'canceled', new Date(), {
        cancelReason: '재발송',
      });
      if (!claimed) return { ok: false, error: 'CONTRACT_BUSY' };
      // cancel() 과 같은 이유로 CAS 이후에 다시 읽는다(발송이 창 안에서 커밋됐을 수 있다).
      const priorRef = (await this.signingRepo.findById(active.id))?.contract.providerRef;
      if (priorRef) {
        try {
          await this.snowsign.cancel(priorRef, '재발송');
        } catch (e) {
          logger.warn('signing.resend_cancel_failed', {
            contractId: active.id,
            err: String(e),
          });
          captureSigningError('signing.resend_cancel_failed', e, {
            contractId: active.id,
            providerRef: priorRef,
          });
        }
      }
    }
    const all = await this.signingRepo.findByRfp(rfpId);
    const round = all.reduce((m, c) => Math.max(m, c.round), 0) + 1;
    // 활성 계약이 없던 경로(취소·거절·만료 후)에선 동시 resend 둘이 여기 닿아
    // 활성 partial unique 를 위반할 수 있다 — 예외가 그대로 새면 타입 없는 rejection
    // 이 되므로 CONTRACT_BUSY 로 옮긴다.
    try {
      const parked = await this.persistAwaiting(randomUUID(), rfp, bid.pgWsId, actor, round);
      if (!parked.ok) return parked;
      // 새 라운드 개설의 감사 기록 — persistAwaiting 의 awaiting_template 감사는 남지만
      // "누가 재발송을 눌러 직전 라운드를 닫았는가"는 여기만 안다. 라운드는 이미
      // 커밋됐으므로 감사 실패가 성공을 되돌리지 않는다(best-effort).
      await this.auditBestEffort(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'signing.resent',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { priorContractId: active?.id, round },
        },
        'signing.resent_audit_failed',
      );
      return { ok: true, degraded: true };
    } catch (e) {
      logger.warn('signing.resend_park_failed', { rfpId, err: String(e) });
      return { ok: false, error: 'CONTRACT_BUSY' };
    }
  }

  /** 딜룸 조회 — ACL(양측). 활성(없으면 최신) 계약 + 참여자 반환. */
  async getForActor(
    rfpId: string,
    actor: Actor,
  ): Promise<
    ServiceResult<{
      contract: SigningContract;
      participants: SigningParticipant[];
    }>
  > {
    // ACL 먼저 — 존재 여부(CONTRACT_NOT_FOUND)를 노출하기 전에 당사자인지 확인한다.
    // 비당사자(비초대 PG 등)가 404/FORBIDDEN 차이로 award·서명 개시 여부를 추론하는
    // 오라클을 막는다.
    const rfp = await this.rfpRepo.findById(rfpId);
    const party = rfp ? await this.resolvePartyByRfp(rfp, actor) : null;
    if (!party) return { ok: false, error: 'FORBIDDEN' };
    const active = await this.signingRepo.findActiveByRfp(rfpId);
    const latest = active ?? (await this.signingRepo.findByRfp(rfpId))[0];
    if (!latest) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const found = await this.signingRepo.findById(latest.id);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    return {
      ok: true,
      contract: party === 'buyer' ? stripProviderRefs(found.contract) : found.contract,
      participants: found.participants,
    };
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
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor)))
      return { ok: false, error: 'FORBIDDEN' };
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
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
      };
    }
  }

  // ─── 건별 임베드 발송 (PG 가 자사 계약서를 직접 올려 보낸다) ─────────────────
  //
  // 템플릿 경로와 결정적으로 다른 점: 계약을 **브라우저 안에서** 스노우싸인이 만든다.
  // 서버는 contract_id 를 동기적으로 받지 못하므로 두 단계로 나뉜다.
  //   ① createSendEmbedSession — 리스를 잡고 임베드 세션을 발급한다.
  //   ② attachProviderContract — 임베드가 만든 계약을 재조회해 검증하고 바인딩한다.
  // ①과 ② 사이는 사람이 PDF 를 올리고 서명칸을 배치하는 시간이다(수 분~수십 분).

  /**
   * 임베드 세션 발급 — 낙찰 PG 만, awaiting 상태에서만.
   *
   * 리스를 여기서 잡는 이유: 담당자 둘이 각자 임베드를 열어 각자 발송하면 스노우싸인
   * 계약이 두 건 살아난다. 뒤늦게 바인딩하는 쪽은 `attachProviderContract` 에서 막히지만
   * 그때는 이미 서명 요청 메일이 두 번 나간 뒤다 — 그래서 진입에서 직렬화한다.
   */
  async createSendEmbedSession(
    rfpId: string,
    actor: Actor,
    opts?: {
      /**
       * 동료가 쥔 리스를 **강제로 가져온다.** 기본은 false — 기본 경로가 절대
       * 밀어내지 않는다는 게 테스트로 고정돼 있다.
       */
      takeOver?: boolean;
    },
  ): Promise<ServiceResult<{ iframeUrl: string; sessionId: string; claimedAt: string }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 먼저(fail-closed) — 존재 여부를 노출하기 전에 당사자인지 본다.
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg')
      return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    // 이어받기 알림 수신자를 이 딜의 PG 워크스페이스로 한정하기 위해 필요하다.
    if (await requiresCommonAgreement(active, this.agreementRepo))
      return { ok: false, error: 'AGREEMENT_REQUIRED' };
    const bidPgWsId = actor.workspaceId;

    // 파트너 오리진은 `appOrigins()` 로만 읽는다 — env 를 직접 읽으면 한쪽만 설정된
    // 깨진 배포에서 던져야 할 가드(both-or-neither)를 건너뛰고, 하드코딩 폴백이
    // 그 사실을 조용히 덮는다. 임베드가 postMessage 를 보낼 오리진이라 특히 그렇다.
    //
    // **리스보다 먼저** 해석한다. 이건 순수 설정 조회라 실패하면 무조건 실패고,
    // 리스를 잡은 뒤에 던지면 세션도 못 만든 채 리스만 남아 PG 가 5분간 잠긴다
    // (아래 try 의 보상 반납은 SnowSign 호출만 감싼다).
    const origin = appOrigins().pg;

    const now = new Date();

    // **이어받기는 순서를 뒤집는다.** 이 경로의 리스 취득은 파괴적이다 — 동료 화면이
    // 닫히고 그 사람이 올리던 PDF·서명칸이 사라진다. 그 절반을 세션 발급보다 먼저
    // 커밋하면, 발급이 실패했을 때 동료 작업만 날아가고 리스는 아무도 안 쥔 상태가
    // 된다(아무도 이득을 못 본다). 실패할 수 있는 쪽을 먼저 하고, 되돌릴 수 없는 쪽을
    // 마지막에 커밋한다. 여기서 발급한 세션을 못 쓰게 되는 건 감수한다 — 세션은 곧
    // 만료되고, 그 대가는 남의 작업 손실보다 훨씬 싸다.
    //
    // 기본 경로는 반대로 둔다(리스 먼저 → 발급 → 실패 시 반납). 거기서 리스는 동시에
    // 연 두 사람 중 하나를 그냥 되돌려보낼 뿐이라 잃을 작업이 없고, 먼저 잡아야
    // 세션이 둘 발급되는 낭비를 막는다.
    if (!opts?.takeOver) {
      const claimed = (
        await this.sendLease.claim({
          contractId: active.id,
          holderUserId: actor.userId,
          now,
        })
      ).ok;
      if (!claimed) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
      // (#1) 스테일 ref 정리는 파괴적(cancel+클리어)이라 **리스를 쥔 뒤에만** 한다.
      // 리스 밖에서 하면 동료의 sendFromTemplate 이 왕복 중인 draft 를 죽여, 그
      // 발송이 성공한 뒤 죽은 계약을 가리키는 sent 딜룸이 된다.
      if (active.providerRef) {
        const stop = await this.resolveStaleEmbedRef(active, rfp, actor);
        if (stop) {
          await this.sendLease.release({
            contractId: active.id,
            claimedAt: now,
          });
          return stop;
        }
      }
    }

    try {
      const s = await this.snowsign.createEmbedSession({
        purpose: 'contract_create',
        allowedOrigins: [origin],
        flows: ['pdf_send'],
        externalSystem: EXTERNAL_SYSTEM,
        // 이 계약을 가리키는 소유 증표. 스노우싸인이 이 값을 계약에 실어 돌려주면
        // attachProviderContract 가 서버측 소유 검증을 할 수 있다(SNOWSIGN_SANDBOX Q3).
        externalId: embedExternalId(active.id),
        referenceId: `sc:${active.id}`,
      });
      // 세션이 손에 들어온 뒤에야 동료를 밀어낸다(위 주석 참조).
      if (opts?.takeOver) {
        const took = await this.sendLease.takeOver({
          rfp,
          pgWsId: bidPgWsId,
          contractId: active.id,
          now,
          actor,
          surface: 'embed',
        });
        if (!took.ok) return took;
        // (#1) 이어받기 경로도 리스 취득 이후에만 스테일 ref 를 정리한다.
        if (active.providerRef) {
          const stop = await this.resolveStaleEmbedRef(active, rfp, actor);
          if (stop) {
            await this.sendLease.release({
              contractId: active.id,
              claimedAt: now,
            });
            return stop;
          }
        }
      }
      // claimedAt 을 함께 돌려준다 — 화면이 임베드를 닫을 때 이 값으로 리스를 반납한다
      // (`releaseSendEmbedClaim`). 값이 틀리면 repo 의 정확일치 가드가 no-op 으로 삼킨다.
      return {
        ok: true,
        iframeUrl: s.iframeUrl,
        sessionId: s.sessionId,
        claimedAt: now.toISOString(),
      };
    } catch (e) {
      // 세션도 못 받았는데 리스가 남으면 다음 시도가 리스 만료까지 막힌다.
      // (이어받기 경로는 아직 리스를 잡지 않았으므로 이 반납은 no-op 이다.)
      await this.sendLease.release({ contractId: active.id, claimedAt: now });
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
      };
    }
  }

  /**
   * (#1) 대기 행에 남은 스테일 providerRef 를 실상태로 갈라 정리한다 — **리스를 쥔
   * 뒤에만 부른다**(cancel+클리어가 파괴적이라, 리스 밖에서 돌면 동료의 진행 중
   * 발송이 만든 draft 를 죽인다). 반환: 진행하면 null, 멈추면 에러 결과(호출자가
   * 리스를 풀고 그대로 반환).
   */
  private async resolveStaleEmbedRef(
    active: SigningContract,
    rfp: RFP,
    actor: Actor,
  ): Promise<{ ok: false; error: string } | null> {
    if (!active.providerRef) return null;
    let stale: SnowSignContractDetail;
    try {
      stale = await this.snowsign.getContract(active.providerRef);
    } catch (e) {
      // 판정 불가면 fail-closed — 살아있을지 모르는 계약의 핸들을 덮어쓰지 않는다.
      // 다음 클릭이 재시도한다.
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
      };
    }
    if (isDispatchedProviderStatus(stale.status)) {
      // 실제로 발송돼 있었다 — 임베드로 두 번째 계약을 만들게 하지 않고 그 자리에서
      // 바인딩한다(H3 자가치유와 같은 커밋 지점). 성공하면 화면은 ALREADY_SENT 를
      // 받고 새로고침해 sent 카드를 본다.
      const healed = await this.reconciliation.bindDispatchedContract({
        active,
        rfp,
        detail: stale,
        providerContractId: active.providerRef,
        actor,
        source: 'self_heal',
        pgWsId: actor.workspaceId,
      });
      if (healed.ok) return { ok: false, error: 'ALREADY_SENT' };
      return healed;
    }
    const norm = mapProviderContractStatus(stale.status);
    // completed 는 "발송된 적 없음"이 아니라 "완주했는데 신호를 놓침"이다 — 여기서
    // 취소하거나 ref 를 지우고 새 임베드를 열면 서명 완료된 계약 위에 두 번째 계약이
    // 생긴다. 분류 불가(미지 status)도 같은 이유로 손대지 않는다(fail-closed —
    // 폴링/reconcile 이 다음 틱에 정리하거나 운영이 본다).
    if (
      norm === 'completed' ||
      (norm === undefined && stale.status.trim().toLowerCase() !== 'draft')
    ) {
      logger.warn('signing.embed_stale_ref_unresolvable', {
        contractId: active.id,
        providerStatus: stale.status,
      });
      return { ok: false, error: 'SNOWSIGN_INVALID_STATUS' };
    }
    // 미발송 초안(draft) 또는 종결(canceled/declined/expired — 죽은 핸들) — 정리하고
    // 진행한다. draft 만 취소가 의미 있다(종결 계약의 cancel 은 provider 가 거절).
    //
    // **결론(Stage 2): 출처를 보지 않고 취소하는 현행 동작이 옳다.**
    //
    // TODOS 가 남긴 판단 기준은 "create 후 즉시 send 면 잔여 초안은 크래시 잔해라
    // 취소가 맞고, 재개 가능한 세션이면 실제 작업물이 날아간다" 였다. compose 는
    // 전자다 — `sendComposedContract` 는 create → bind → send 를 한 호출에서 끝내고,
    // **문서가 우리 DB 에 있어 언제든 다시 렌더할 수 있다.** 그래서 여기 남은 compose
    // 초안은 정의상 create 와 send 사이에서 죽은 잔해이고, 취소해도 잃는 작업물이
    // 없다(발송 전이라 메일 0통·쿼터 0). 오히려 안 지우면 공급자 측 고아가 쌓인다.
    //
    // 임베드(사람이 iframe 안에서 PDF 를 올리고 서명칸을 배치하는 경로)와 대칭이
    // 아닌 이유가 이것이다 — 그쪽 작업물은 스노우싸인 안에만 있어 되만들 수 없다.
    // 회귀 테스트가 이 결론을 고정한다(compose 초안도 취소된다).
    // (Stage 2 가 결론낸 항목 — TODOS.md 에서 해결로 닫혔다. compose 는 create 직후
    //  곧바로 send 하므로 남은 초안은 크래시 잔해가 맞다는 것이 그 근거다.)
    if (norm === undefined) {
      try {
        await this.snowsign.cancel(active.providerRef, '미발송 초안 정리');
      } catch (ce) {
        logger.warn('signing.embed_stale_draft_cancel_failed', {
          contractId: active.id,
          err: String(ce),
        });
      }
    }
    // clear 는 CAS 다: 프로브(getContract) 왕복 동안 임베드 attach(리스 무요구)가
    // 같은 행에 실제 발송된 계약을 바인딩했을 수 있다 — id 만 보고 지우면 그 ref 가
    // 사라져 "sent + provider_ref NULL = 영구 조정불가" 행이 된다. 실패는 경합으로
    // 물러난다(호출자가 리스를 풀고 그대로 반환 — clearDraftRefOrBackOff 를 쓰지
    // 않는 이유: 이 함수는 리스 반납을 소유하지 않는다).
    if (!(await this.signingRepo.clearDraftRefIf(active.id, active.providerRef))) {
      logger.warn('signing.draft_clear_cas_lost', { contractId: active.id });
      return { ok: false, error: 'CONTRACT_BUSY' };
    }
    return null;
  }

  /**
   * 리스를 쥔 사람 — 이어받기 확인 다이얼로그가 이름을 띄우기 위해 쓴다.
   *
   * PG 로만 게이트한다: 구매사는 어느 PG 담당자가 작성 중인지 알 이유가 없다.
   * 이름은 `teamRoster` 에서 가져온다 — 승인 멤버·시스템 계정 제외로 이미 걸러져
   * 있고, 같은 사람이 `@` 멘션에서 보던 이름과 글자까지 같다. 로스터에 없으면
   * `null` 을 돌려주고 화면이 '다른 담당자'로 적는다(추측해서 이름을 만들지 않는다).
   * **이름만** 보낸다 — 이메일·전화는 이 표면에 필요 없다.
   */
  async getSendLeaseHolder(
    rfpId: string,
    actor: Actor,
  ): Promise<
    ServiceResult<{
      holder: { userId: string; name: string } | null;
      isSelf: boolean;
    }>
  > {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg')
      return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    return {
      ok: true,
      ...(await this.sendLease.holder({
        contractId: active.id,
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
      })),
    };
  }

  /**
   * 하트비트 — 패널이 열려 있는 동안 리스를 연장한다.
   *
   * `claimedAt` 정확일치일 때만 성공하고 **새 토큰을 돌려준다**. 호출부는 그 값을 다음
   * 연장·반납에 쓴다. 실패(CONTRACT_BUSY)는 리스가 만료돼 다른 담당자가 가져갔다는
   * 뜻이므로, 호출부는 하트비트를 멈추고 자기 임베드를 닫아야 한다 — 그대로 발송하면
   * 계약이 두 건 살아난다.
   */
  async renewSendEmbedClaim(
    rfpId: string,
    claimedAt: string,
    actor: Actor,
  ): Promise<ServiceResult<{ claimedAt: string }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg')
      return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const current = new Date(claimedAt);
    if (Number.isNaN(current.getTime())) return { ok: false, error: 'INVALID_INPUT' };

    const next = new Date();
    const renewed = await this.sendLease.renew({
      contractId: active.id,
      holderUserId: actor.userId,
      current,
      next,
    });
    return renewed.ok ? { ok: true, claimedAt: renewed.claimedAt.toISOString() } : renewed;
  }

  /**
   * 임베드 패널을 닫을 때 발송 리스를 반납한다.
   *
   * 리스가 있는 이유는 담당자 둘이 동시에 임베드를 열어 계약이 두 건 발송되는 것을
   * 막기 위해서다. 하지만 닫기가 리스를 안 풀면 **방금 닫은 본인이** 리스 만료까지
   * 자기 자신에게 잠긴다 — 실사용에서 바로 드러난 dead end 다. 닫기는 "이제 안
   * 쓴다"는 선언이므로 반납이 옳다.
   *
   * `claimedAt` 정확일치일 때만 푼다(repo 가드): 리스가 만료돼 다른 담당자가 재취득한
   * 뒤 옛 세션의 뒤늦은 닫기가 도착해도 남의 살아있는 클레임을 풀지 못한다. 그래서
   * 값이 틀려도 에러가 아니라 조용한 no-op 이다 — 닫기는 실패해서 사용자를 막을 만한
   * 조작이 아니다.
   *
   * 화면은 닫기뿐 아니라 **언마운트**(딜룸 탭 전환·모달 닫기)에서도 반납한다. 탭을
   * 통째로 닫거나 크래시하는 경우까지는 못 잡지만(beforeunload 는 신뢰할 수 없다),
   * 그때는 하트비트가 멎어 `EMBED_SEND_LEASE_MS`(5분) 만료가 백스톱이 된다.
   */
  async releaseSendEmbedClaim(
    rfpId: string,
    claimedAt: string,
    actor: Actor,
  ): Promise<ServiceResult> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg')
      return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    // 이미 발송됐으면 리스는 의미가 없다(claimForSend 는 awaiting 에서만 성공한다).
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const at = new Date(claimedAt);
    if (Number.isNaN(at.getTime())) return { ok: false, error: 'INVALID_INPUT' };
    return this.sendLease.release({
      contractId: active.id,
      claimedAt: at,
      surface: 'embed',
    });
  }

  /**
   * 임베드가 만든 스노우싸인 계약을 우리 계약 행에 바인딩한다.
   *
   * **postMessage 는 신뢰 경계가 아니다** — 이 메서드가 진짜 게이트다. 계약 id 는
   * 브라우저에서 왔으므로 ACL 을 다시 보고, 스노우싸인에 직접 재조회해 실재를 확인하고,
   * external_id 가 회신되면 그것이 이 계약을 가리키는지까지 본다.
   *
   * 참여자는 우리 DB 가 아니라 **스노우싸인이 실제로 계약에 넣은 사람들**이 진실이다
   * (임베드는 참여자 프리필을 지원하지 않아 PG 가 직접 타이핑한다). 구매사 담당자가
   * 그 안에 없으면 `participantMismatch` 로 알린다 — 이미 발송된 계약이라 막지는 않고
   * 화면이 경고 + 취소를 유도한다.
   */
  async attachProviderContract(
    rfpId: string,
    providerContractId: string,
    actor: Actor,
    opts?: {
      /**
       * 사용자가 보고 있던 계약 행. 복구 다이얼로그는 몇 분씩 열려 있을 수 있고 그 사이
       * `resend` 가 새 대기 라운드를 연다 — 이 액션은 rfpCode 로 활성 행을 다시 찾으므로
       * 확인하지 않으면 엉뚱한 라운드에 붙는다. 임베드 경로는 안 넘긴다(그 자리에서 끝난다).
       */
      expectedContractId?: string;
    },
  ): Promise<ServiceResult<{ participantMismatch?: boolean }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg')
      return { ok: false, error: 'FORBIDDEN' };
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    // 보던 것과 다른 행이면 여기서 끝낸다 — 공급자를 부르기 전에.
    if (opts?.expectedContractId && opts.expectedContractId !== active.id) {
      return { ok: false, error: 'CONTRACT_CHANGED' };
    }
    // 멱등 — 복구와 postMessage 가 겹쳐 두 번 도착할 수 있다. 다만 **그냥 ok 로
    // 빠지면 안 된다**: 첫 시도에서 바인딩은 됐는데 종결만 실패한 경우(위 catch),
    // 재시도가 여기서 끝나면 종결이 클릭으로는 영영 안 일어난다. 이미 완료된 계약이면
    // 한 번 더 밀어 준다(멱등이라 무해).
    if (active.providerRef === providerContractId) {
      if (active.status === 'sent' || active.status === 'in_progress') {
        await this.reconciliation.ensureFinalizedIfProviderCompleted(active.id, providerContractId);
      }
      return { ok: true };
    }
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    // 같은 provider 계약을 두 계약 행이 쥐면 상태·완료본이 서로를 덮어쓴다.
    if (await requiresCommonAgreement(active, this.agreementRepo))
      return { ok: false, error: 'AGREEMENT_REQUIRED' };
    const bound = await this.signingRepo.findByProviderRef(providerContractId);
    if (bound && bound.id !== active.id) return { ok: false, error: 'PROVIDER_CONTRACT_TAKEN' };

    let detail;
    try {
      detail = await this.snowsign.getContract(providerContractId);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
      };
    }

    // ⚠️ **이 검증은 현재 실행되지 않는다.** 실측(2026-08-01, docs/SNOWSIGN_SANDBOX.md
    // Q3) 결과 `GET /v1/contracts/{id}` 응답에 `external_id`/`integration` 키가 아예
    // 없어서 `detail.externalId` 가 항상 undefined 다. 즉 지금 실제 게이트는 위의
    // ACL(낙찰 PG)과 provider_ref 바인딩 유일성 둘뿐이다 — 소유가 검증되고 있다고
    // 착각하면 안 된다(잔여 위험은 TODOS.md Signing 절 P2).
    // 코드를 남기는 이유: 공급자가 필드를 추가하면 그 순간 저절로 살아난다.
    // 실제로 발송된 계약만 받아들인다. postMessage 는 신뢰 경계 밖이라 초안 상태의
    // 계약 id 가 흘러들 수 있는데, 그대로 통과시키면 아무에게도 안 나간 계약으로
    // 딜룸이 `sent` 가 되고 양측에 알림까지 나간다(구매사는 오지 않을 메일을 기다린다).
    // 이 게이트는 external_id 검증과 달리 **실제로 동작한다** — status 는 항상 회신된다.
    // 완료 계약은 예외적으로 받아들인다 — 단 **서버가 기록한 노출 사실**이 있을 때만.
    // (클라이언트가 보내는 `source` 로 가르면 안 된다: 그건 감사 라벨이고 빼면 꺼진다.)
    // 우리 스캔이 내보낸 적 있는 ref 는 이미 상관키를 통과한 것이고, 아래 디스클로저
    // 게이트가 한 번 더 대조한다. 임베드 postMessage 로 흘러든 완료 id 는 여기서 막힌다 —
    // 그걸 통과시키면 아무도 서명하지 않은 문서의 다운로드가 구매사에게 열린다.
    const completedRecovery =
      mapProviderContractStatus(detail.status) === 'completed' &&
      (await this.signingRepo.isRefDisclosed(providerContractId));
    if (!isDispatchedProviderStatus(detail.status) && !completedRecovery) {
      logger.warn('signing.attach_not_dispatched', {
        contractId: active.id,
        providerRef: providerContractId,
        providerStatus: detail.status,
      });
      return { ok: false, error: 'CONTRACT_NOT_SENT' };
    }

    if (detail.externalId && !matchesEmbedExternalId(detail.externalId, active.id)) {
      logger.warn('signing.attach_external_id_mismatch', {
        contractId: active.id,
        providerRef: providerContractId,
      });
      return { ok: false, error: 'FORBIDDEN' };
    }

    // 참여자 매핑용 이메일은 bindDispatchedContract 가 스스로 조회한다 — 여기서는
    // 디스클로저 게이트의 상관키에 쓸 구매사 이메일만 필요하다.
    const buyerSigner = await this.userRepo.findContactById(rfp.createdBy);
    const buyerEmail = buyerSigner?.email.toLowerCase();

    // 감사 라벨용 출처. **보안 판정에는 쓰지 않는다** — 이 값은 클라이언트가 보내는
    // 선택 필드에서 나오므로, 게이트를 여기에 걸면 필드 하나를 빼는 것으로 꺼진다.
    const source = opts?.expectedContractId ? 'recovery' : 'embed';

    // 게이트의 근거는 **서버가 기록한 노출 사실**이다: 복구 스캔이 한 번이라도
    // 내보낸 공급자 계약 id 는, 어느 딜에 붙이든 그 딜의 상관키를 통과해야 한다.
    //
    // 이 규칙이 필요한 이유: 스캔 이전에는 PG 가 **바인딩되지 않은** 계약의 id 를 알
    // 방법이 없었다(postMessage 가 도착했다면 그 자리에서 바인딩돼 provider_ref
    // 유일성에 잠긴다 — 고아란 곧 그 메시지를 못 받았다는 뜻이다). 목록이 그 id 를
    // 브라우저로 내보내는 순간, 딜 A 에서 배운 id 를 딜 B 에 붙이는 경로가 열린다.
    // 붙으면 구매사 B 가 구매사 A 의 계약 문서를 조회하게 된다.
    //
    // 노출된 적 없는 계약(임베드에서 방금 만든 것)에는 걸지 않는다 — 여기에 상관키를
    // 걸면 구매사 이메일 오타로 나간 계약이 **바인딩조차 안 돼** 취소 핸들
    // (provider_ref)을 영영 못 얻는다. 경고로 두는 편이 낫다.
    if (source === 'recovery' || (await this.signingRepo.isRefDisclosed(providerContractId))) {
      const pgEmails = new Set(
        (await this.workspaceRepo.approvedMemberRecipients(bid.pgWsId)).map((m) =>
          m.email.toLowerCase(),
        ),
      );
      if (!buyerEmail || !participantsMatchDeal(detail.participants, buyerEmail, pgEmails)) {
        logger.warn('signing.recover_bind_mismatch', {
          contractId: active.id,
          providerRef: providerContractId,
        });
        return { ok: false, error: 'FORBIDDEN' };
      }
    }

    return this.reconciliation.bindDispatchedContract({
      active,
      rfp,
      detail,
      providerContractId,
      actor,
      source,
      pgWsId: bid.pgWsId,
      pgSubmittedBy: bid.submittedBy,
    });
  }

  /** cron 폴링 드라이버 — 진행 중(sent/in_progress) 계약을 오래 안 본 순으로 동기화. */
  /**
   * onAward 유실 자가치유 — awarded 인데 계약 행이 전무한 딜에 대기 라운드를 만든다.
   * onAward 는 after() fire-and-forget 라 프로세스 재시작·DB 순단에 유실될 수 있고,
   * 유실되면 양측 모두 계약 탭이 영영 없다(넛지는 기존 awaiting 행만, 폴링은
   * sent/in_progress 만 봐서 어느 것도 되살리지 못한다). cron 이 틱마다 부른다.
   */
  async sweepMissingContracts(limit = 20): Promise<ServiceResult<{ created: number }>> {
    const orphans = await this.signingRepo.findAwardedRfpsWithoutContract(
      limit,
      new Date(Date.now() - SWEEP_RECENCY_MS),
    );
    let created = 0;
    for (const o of orphans) {
      // onAward 재사용 — 멱등이고 알림 팬아웃까지 동일 경로다. actor 는 원래 선정을
      // 커밋했던 구매사 담당(rfp.createdBy)으로 복원한다.
      // (#3) 행 단위 격리 — persistAwaiting 은 throw 할 수 있고(동시 award 훅과의
      // 유니크 경합·FK), 한 포이즌 행이 배치 전체와 cron 응답을 죽이면 안 된다.
      let r: ServiceResult;
      try {
        r = await this.onAward(o.rfpId, o.awardedBidId, {
          userId: o.createdBy,
          workspaceId: o.buyerWsId,
        });
      } catch (e) {
        logger.error('signing.sweep_row_threw', {
          rfpId: o.rfpId,
          err: String(e),
        });
        continue;
      }
      if (r.ok) {
        created += 1;
        logger.warn('signing.sweep_recreated_missing_contract', {
          rfpId: o.rfpId,
        });
        captureSigningError(
          'signing.sweep_recreated_missing_contract',
          new Error('onAward was lost and recreated by sweep'),
          { rfpId: o.rfpId },
        );
      } else {
        logger.error('signing.sweep_failed', {
          rfpId: o.rfpId,
          error: r.error,
        });
      }
    }
    return { ok: true, created };
  }

  /**
   * 오래 방치된 awaiting_pg_template 계약의 PG 에게 계약서 발송을 재넛지한다. 기본
   * 7일 스로틀(lastPolledAt 마커) — 방치된 딜(buyer 화면에 "PG사가 계약서 준비 중"으로
   * 무기한 표시)이 조용히 dead-end 로 남지 않도록 cron 이 주기 호출한다. 재넛지한 계약 수 반환.
   */
  /**
   * 마감 없는 계약이 오래 열려 있으면 운영자에게 알린다 — 조항형 경로의 **보상 통제**.
   *
   * 왜 있는가: `deadline_days` 가 `POST /v1/contracts` 에서 201 로 수락된 뒤 조용히
   * 무시되어(S6 실측) 조항형 계약은 `expires_at` 이 없고 `expired` 에 **도달할 수 없다**.
   * 템플릿 경로 계약이 30일에 만료되는 것과 달리 아무도 취소하지 않으면 영영 열려 있다.
   * 공급자에 마감을 심을 수단이 없으므로 마감을 흉내내지 않고(거짓 약속 금지) 관측만
   * 한다 — **자동 취소는 하지 않는다**(되돌릴 수 없고, 상대가 막 서명하려는 순간과
   * 경합한다). 사람이 딜룸에서 판단해 취소한다.
   *
   * 사용자 알림이 아니라 운영자 알림인 것도 의도다: 양측은 이미 이메일 링크를 갖고 있고
   * 리마인더 버튼도 있다. 여기서 필요한 것은 "이 딜이 잊혔다"를 **우리가** 아는 것이다.
   */
  async notifyStaleSent(limit = 50): Promise<{ notified: number }> {
    const now = Date.now();
    const stale = await this.signingRepo.findStaleSent(
      new Date(now - STALE_SENT_AFTER_MS),
      new Date(now - STALE_SENT_REALERT_MS),
      limit,
    );
    let notified = 0;
    for (const c of stale) {
      // CAS 승자만 알린다 — 폴러 두 틱이 겹쳐도 한 번이다. 판정을 먼저 하고 알리는
      // 순서가 중요하다(알린 뒤 클레임하면 실패 시 중복 발화가 남는다).
      if (
        !(await this.signingRepo.claimStaleNotify(
          c.id,
          new Date(now),
          new Date(now - STALE_SENT_REALERT_MS),
        ))
      ) {
        continue;
      }
      const rfp = await this.rfpRepo.findById(c.rfpId);
      if (!rfp) continue;
      // 이 루프는 한 틱에 limit(기본 50)건까지 도는데, 던져 놓고 지나가면 50개가 동시에
      // 나가 소켓 50개를 함께 점유한다. await 이 막는 것은 **그 동시성 하나**다.
      //
      // ⚠ 페이싱이 아니다. 슬랙이 건강하면 왕복이 100~200ms 라 직렬화해도 초당 5~10건이
      // 나가고, 리밋(1건/초)은 여전히 넘는다 — 429 는 그대로 난다(수용된 결과다). 진짜
      // 페이싱을 원하면 sleep 이 필요하고, 그건 크론 예산과 맞바꾸는 별개 결정이다.
      // never-reject 라 이 await 이 루프를 깨뜨릴 일은 없다.
      await notifySigningOperator({
        event: 'stale_sent',
        rfpCode: rfp.code,
        rfpTitle: rfp.title,
        round: c.round,
      });
      notified += 1;
    }
    return { notified };
  }

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
      // 스로틀 마커이자 **메일 dedupeKey 의 회차 성분**이다 — 같은 값을 둘 다에 쓴다.
      // 회차가 키에 안 들어가면 두 번째 넛지부터 메일이 조용히 사라진다(인앱은 쌓이는데
      // 메일만 안 오는, 알아채기 어려운 실패다).
      const nudgedAt = new Date();
      // 렌더는 트랜잭션 **밖**에서 한다 — CPU 바운드 SSR 렌더를 트랜잭션 안에서 돌리면
      // 그동안 풀 커넥션을 쥐고 있고, 이 루프는 최대 50건이라 그게 50번 반복된다.
      // 입력(rfp.code·rfp.title)은 이미 트랜잭션 전에 다 해석돼 있다.
      const nudgeHtml = await renderSigningAwaitingTemplate({
        rfpId: rfp.code,
        rfpTitle: rfp.title,
        dealRoomUrl: `${baseUrlFor('pg')}${pgDealRoomLink(rfp.code, 'contract')}`,
        isNudge: true,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._db.transaction(async (tx: any) => {
        const pgMembers = await this.workspaceRepo.approvedMemberRecipients(bid.pgWsId, tx);
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: pgMembers.map((m) => ({
              userId: m.userId,
              workspaceId: bid.pgWsId,
              email: m.email,
            })),
            channels: ['inapp', 'email'],
            type: 'signing.awaiting_template',
            title: `[${rfp.code}] 계약서를 확인하고 보내 주세요`,
            // 고아(발송은 됐는데 완료 신호가 유실된 경우)에게 "아직 안 보냈다"고
            // 하면 거짓말이 된다 — 그 사람은 이미 보냈다. 양쪽 다 담는다.
            body: '딜룸의 계약 탭에서 서명을 요청해 주세요. 이미 요청했다면 발송 결과를 확인해 주세요.',
            linkUrl: pgDealRoomLink(rfp.code, 'contract'),
            email: {
              event: 'signing.awaiting_template',
              subject: `[서포트비 · ${rfp.code}] 계약서를 보내 주세요`,
              html: nudgeHtml,
              // 수신자 × 회차 둘 다 키에 들어간다 — 어느 하나라도 빠지면 조용히 유실된다.
              dedupeKey: (r) => `signing:${c.id}:nudge:${nudgedAt.getTime()}:${r.userId}`,
            },
          })),
        );
        // 재넛지 스로틀 마커(awaiting 은 폴링 대상이 아니라 lastPolledAt 재사용).
        await this.signingRepo.patchContract(c.id, { lastPolledAt: nudgedAt.toISOString() }, tx);
      });
      emitAfterCommit(pendingEmits);
      nudged += 1;
    }
    return { nudged };
  }

  // ─── private ────────────────────────────────────────────────────────────────

  private async persistAwaiting(
    contractId: string,
    rfp: RFP,
    pgWsId: string,
    actor: Actor,
    round: number,
  ): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    // 렌더는 트랜잭션 **밖**에서 — 안에서 하면 CPU 바운드 SSR 렌더가 도는 동안
    // 풀 커넥션을 쥔다. 입력은 이미 다 해석돼 있다.
    const awaitingHtml = await renderSigningAwaitingTemplate({
      rfpId: rfp.code,
      rfpTitle: rfp.title,
      dealRoomUrl: `${baseUrlFor('pg')}${pgDealRoomLink(rfp.code, 'contract')}`,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any) => {
      await this.signingRepo.create(
        {
          id: contractId,
          rfpId: rfp.id,
          status: 'awaiting_pg_template',
          round,
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
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: pgMembers.map((m) => ({
            userId: m.userId,
            workspaceId: pgWsId,
            email: m.email,
          })),
          channels: ['inapp', 'email'],
          type: 'signing.awaiting_template',
          title: `[${rfp.code}] 계약서를 확인하고 보내 주세요`,
          body: '견적이 선정됐어요. 딜룸의 계약 탭에서 내용을 확인하고 전자서명을 요청해 주세요.',
          linkUrl: pgDealRoomLink(rfp.code, 'contract'),
          email: {
            event: 'signing.awaiting_template',
            subject: `[서포트비 · ${rfp.code}] 계약서를 보내 주세요`,
            html: awaitingHtml,
            // ⚠️ 수신자마다 달라야 한다 — 상수 키면 outbox dedupe UNIQUE 에 걸려
            // 첫 1건 말고 전부 조용히 사라진다. 라운드는 contractId 가 이미 가른다.
            dedupeKey: (r) => `signing:${contractId}:awaiting:${r.userId}`,
          },
        })),
      );
      return { ok: true as const };
    });
    if (result.ok) {
      emitAfterCommit(pendingEmits);
      void notifySigningOperator({
        event: 'awaiting_created',
        rfpCode: rfp.code,
        rfpTitle: rfp.title,
        round,
      });
    }
    return result;
  }
  private resolvePartyByRfp(rfp: RFP, actor: Actor) {
    return resolveSigningParty(this.bidRepo, rfp, actor);
  }

  listRecoveryCandidates(rfpId: string, actor: Actor) {
    return this.recovery.listRecoveryCandidates(rfpId, actor);
  }

  reconcileStatus(contractId: string) {
    return this.reconciliation.reconcileStatus(contractId);
  }

  ensureFinalized(contractId: string) {
    return this.reconciliation.ensureFinalized(contractId);
  }

  pollPending(limit: number) {
    return this.reconciliation.pollPending(limit);
  }

  reconcileIfStale(contractId: string, staleMs = 30_000) {
    return this.reconciliation.reconcileIfStale(contractId, staleMs);
  }

  reconcileByProviderRef(providerRef: string) {
    return this.reconciliation.reconcileByProviderRef(providerRef);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export const {
  get: getContractSigningService,
  set: __setContractSigningServiceForTest,
  reset: __resetContractSigningServiceForTest,
} = defineAsyncSingleton('contract_signing_service', 'service', async () => {
  const [
    {
      getDb,
      getSigningContractRepo,
      getRfpRepo,
      getBidRepo,
      getUserRepo,
      getWorkspaceRepo,
      getAuditLogRepo,
      getPgSigningTemplateRepo,
    },
    { getSnowSignClient },
  ] = await Promise.all([
    import('@/lib/server/repositories/factory'),
    import('@/lib/server/signing/snowsign-client'),
  ]);
  const [db, signingRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo, templateRepo] =
    await Promise.all([
      getDb(),
      getSigningContractRepo(),
      getRfpRepo(),
      getBidRepo(),
      getUserRepo(),
      getWorkspaceRepo(),
      getAuditLogRepo(),
      getPgSigningTemplateRepo(),
    ]);
  return new ContractSigningService(
    db,
    signingRepo,
    rfpRepo,
    bidRepo,
    userRepo,
    wsRepo,
    auditRepo,
    getSnowSignClient(),
    templateRepo,
    await getAgreementService(),
    await getAgreementRepo(),
    async (contractId) => {
      const { getContractArchiveService } = await import('./contract-archive');
      return (await getContractArchiveService()).createPendingForContract(contractId);
    },
  );
});
