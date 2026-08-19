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
import {
  notifySigningOperator,
  type SigningOperatorNotice,
} from '@/lib/server/notifications/operator-signing';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { logger } from '@/lib/observability/logger';
import { appOrigins } from '@/lib/site-routing';
import { EMBED_SEND_LEASE_MS } from '@/lib/signing/embed-lease';
import { REMIND_COOLDOWN_MS } from '@/lib/signing/remind-cooldown';
import {
  PROVIDER_ENFORCED_SECURITY_METHOD,
  resolveSecurityMethod,
} from '@/lib/signing/security-method';
import { SIGNING_ROLE_LABELS, buildSignatureFieldsPayload } from '@/lib/signing/template-fields';
// 조항형 발송 — 문서 해석·렌더·업로드. 모두 서버 전용이다.
import { resolveContractDoc } from '@/lib/contract-doc/variables';
import { buildFeeTableRows } from '@/lib/contract-doc/fee-table';
import { renderContractPdf } from '@/lib/contract-doc/render-pdf';
import { loadGlyphCoverage, missingGlyphs } from '@/lib/contract-doc/pdf-font';
import { uploadPdfBytes } from '@/lib/server/signing/upload-bytes';
import {
  bindUploadSlot,
  releaseUploadSlot,
  releaseUploadSlotByUploadId,
  reserveUploadSlot,
} from '@/lib/server/signing/upload-session-budget';
import {
  EXTERNAL_SYSTEM,
  SnowSignError,
  type SnowSignClient,
  type SnowSignContractDetail,
  type SnowSignContractSummary,
} from '@/lib/server/signing/snowsign-client';
import { captureSigningError } from '@/lib/server/signing/observability';
import type { RFP } from '@/lib/types/rfp';
import type { Notification } from '@/lib/types/notification';
import type {
  PgSigningTemplate,
  SigningContract,
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantPatch,
  SigningParticipantStatus,
  SigningRecoveryCandidate,
  SigningTemplateFieldInput,
} from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';

export type { Actor, ServiceResult };

const TERMINAL = new Set<SigningContractStatus>(['completed', 'declined', 'expired', 'canceled']);

// remind 실패 중 "요청이 실행되지 않았음"이 보장되는 코드 — 이때만 쿨다운 클레임을
// 되돌린다. 목록에 없는 코드(NETWORK/MALFORMED/ERROR 등)는 이미 나갔을 수 있다.
const REMIND_NOT_EXECUTED_CODES = new Set([
  'SNOWSIGN_NO_KEY',
  'SNOWSIGN_INVALID_KEY',
  'SNOWSIGN_VALIDATION',
  'SNOWSIGN_NOT_FOUND',
  'SNOWSIGN_INVALID_STATUS',
  'SNOWSIGN_RATE_LIMIT',
]);

type Recipient = { userId: string; workspaceId: string; email: string };
type Party = 'buyer' | 'pg';


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
 * 바인딩 도중 계약이 awaiting 을 벗어났다(구매사 취소·웹훅 종결 등).
 * 트랜잭션을 되감는 신호용 sentinel.
 */
class ContractNoLongerAwaitingError extends Error {
  constructor() {
    super('contract left awaiting during bind');
    this.name = 'ContractNoLongerAwaitingError';
  }
}

// 임베드가 실제로 **발송까지** 끝낸 계약인지 판정한다. 초안(`draft`)은 아무에게도
// 나가지 않았으므로 딜룸을 '발송됨'으로 전진시키면 안 된다.
// 실측(docs/SNOWSIGN_SANDBOX.md Q2) 상 발송 직후 status 는 `pending` 이다.
// 종결 상태는 **일부러 뺐다.** 임베드를 막 끝낸 계약이 completed·cancelled 일 수는
// 없다. 그런 걸 붙이면 딜룸이 '전자서명이 시작됐어요'를 알린 직후 '서명 완료'가 되고,
// 이 딜의 누구도 서명하지 않은 문서의 다운로드 링크가 구매사에게 열린다.
// (종결 상태 매핑은 `mapProviderContractStatus` 가 따로 소유한다 — reconcile 경로.)
const DISPATCHED_PROVIDER_STATUSES = new Set(['pending', 'sent', 'in_progress']);

/**
 * `signing_contracts_provider_ref_uniq` 위반인가.
 *
 * 이 제약이 곧 provider 계약 바인딩의 선착순 심판이다 — 서비스의 사전 검사는
 * 트랜잭션 밖 read-then-write 라 동시 요청 둘이 나란히 통과한다. 진 쪽은 여기로
 * 떨어지므로, 저장 실패가 아니라 '이미 다른 계약이 쥐었다'로 말해야 한다.
 * (postgres-js 는 `.code`, PGlite 는 `.cause.code` 에 SQLSTATE 를 싣는다.)
 */
function isProviderRefConflict(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const rec = e as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  const code = rec.code ?? rec.cause?.code;
  if (code !== '23505') return false;
  return String(rec.message ?? '').includes('provider_ref');
}

/**
 * 고아 복구 스캔의 시간 예산. PG 가 스피너를 보며 기다린다.
 *
 * 클라이언트에는 총 데드라인이 없다(호출당 최악 ≈ 61초). 그래서 호출자인 우리가
 * AbortSignal 로 예산을 쥔다. 클라이언트의 시도당 타임아웃(15초)보다 짧게 잡아
 * 멎은 호출을 중간에 끊는다.
 */
export const SIGNING_RECOVERY_DEADLINE_MS = 12_000;

/**
 * 상세 조회 상한. 논리 호출은 목록 ≤6(상태 3종) + 상세 12 = 18회지만, 각 호출이
 * `maxRetries: 1` 로 재시도를 한 번 더 하므로 **실제 HTTP 는 최대 36회**다.
 * 스노우싸인 rate limit 은 분당 100회이고 그 키를 모든 PG사·모든 서명 기능이
 * 공유한다(되돌린 cron 설계는 틱당 1010회였다).
 */
export const RECOVERY_MAX_DETAIL_LOOKUPS = 12;

/** 동시 상세 조회 수. 3웨이브 × ~1초면 데드라인 안에 들어온다. */
const RECOVERY_DETAIL_CONCURRENCY = 4;

/**
 * 훑을 provider 상태 — `in_progress` 를 빼면 구매사가 먼저 서명한 고아를 놓치고,
 * `completed` 를 빼면 **양측이 서명까지 마친 고아가 영영 안 잡힌다**(딜룸은 무기한
 * '계약서 준비 중', 완료본은 providerRef 가 없어 다운로드 불가, 남는 길은 이미
 * 서명한 사람들에게 재서명을 요청하는 것뿐).
 */
const RECOVERY_SCAN_STATUSES = ['pending', 'in_progress', 'completed'] as const;

/**
 * 복구 스캔이 후보로 **보여줄 수 있는** 상태. dispatched(발송됨)에 더해 `completed`
 * 를 포함한다 — 다만 바인딩 수락은 이것만으로 결정되지 않는다. 완료 계약은 서버가
 * 기록한 노출 사실(`isRefDisclosed`)이 있을 때만 붙일 수 있다(아래 attach 게이트).
 */
function isRecoverableProviderStatus(s: string): boolean {
  return isDispatchedProviderStatus(s) || mapProviderContractStatus(s) === 'completed';
}

/** 선정보다 먼저 만들어진 계약일 수 없다. 시계 오차 여유. */
const RECOVERY_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * 이 계약이 **이 딜의 것인지** 판정한다 — 복구의 보안 경계.
 *
 * 구매사 담당자 이메일 하나로는 안 된다. 그건 "이 딜"이 아니라 "이 구매사"를 가리켜서,
 * 한 담당자가 견적을 여럿 낸 평범한 상황에 대기 중인 딜이 다른 딜의 계약을 집어온다
 * (지난 시도에서 이걸로 경쟁 PG 의 취소권과 완료본이 넘어갈 뻔했다).
 *
 * PG 쪽은 `bid.submittedBy` 가 아니라 **워크스페이스 승인 멤버 전체**로 본다 —
 * 견적을 낸 사람과 계약을 보낸 사람이 다를 수 있고, 좁게 잡으면 정작 필요할 때
 * 후보가 0건이 돼 조용히 실패한다. 딜 스코핑(경쟁사 배제)은 그대로 유지된다.
 *
 * 나중에 `participantMismatch` 를 경고에서 차단으로 승격할 때 여기 한 곳만 고치면 된다.
 */
function participantsMatchDeal(
  participants: ReadonlyArray<{ email: string }>,
  buyerEmail: string,
  pgEmails: ReadonlySet<string>,
): boolean {
  const emails = participants.map((p) => p.email.toLowerCase());
  return emails.includes(buyerEmail) && emails.some((e) => pgEmails.has(e));
}

function isDispatchedProviderStatus(s: string): boolean {
  return DISPATCHED_PROVIDER_STATUSES.has(s.trim().toLowerCase());
}

/**
 * 이 **초안 자신의** 참여자 정책이 본인인증으로 강제돼 있는가.
 *
 * 발송 전 정책 검사(`getTemplate` 의 `signers[].security_method`)는 **템플릿**을 본다 —
 * 이미 만들어진 초안의 참여자 정책은 생성 시점에 고정되고 그 검사에 보이지 않는다.
 * 그래서 초안을 재사용하려면 초안에게 직접 물어야 한다. 물어보지 않으면, 본인인증
 * 도입 전에 phone 없이 만들어진 초안이 그대로 발송되면서 우리 참여자 행에는
 * `easy_cert` 가 적히는 거짓말이 된다(정확히 발송 게이트가 막으려던 그것).
 *
 * fail-closed 다 — 참여자가 없거나 모자라거나 값이 비면 "강제 아님"으로 읽는다.
 * 템플릿 경로는 **항상 정확히 두 역할**(`SIGNING_ROLE_LABELS`)로 계약을 만들므로
 * 길이 조건이 값싼 안전벨트가 된다. 틀린 쪽으로 틀려도 손해는 초안 하나를 다시
 * 만드는 것뿐이고(발송 전이라 메일도 쿼터도 안 썼다), 반대로 틀리면 강제가 꺼진
 * 계약이 나간다.
 */
function isDraftAuthEnforced(d: SnowSignContractDetail): boolean {
  return (
    d.participants.length >= SIGNING_ROLE_LABELS.length &&
    d.participants.every((p) => p.securityMethod === PROVIDER_ENFORCED_SECURITY_METHOD)
  );
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

/**
 * (#2) 스윕 최근성 창 — onAward 유실은 초 단위 사고라 짧아도 되지만, cron 정지 등
 * 운영 사고를 흡수하도록 48시간을 준다. 창이 없으면 서명 기능 이전에 낙찰된 옛 딜
 * 전부가 첫 배포일에 "고아"로 재생성돼 알림이 쏟아진다.
 */
const SWEEP_RECENCY_MS = 48 * 60 * 60 * 1000;

export class ContractSigningService {
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
    private readonly templateRepo: PgSigningTemplateRepo,
  ) {}

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
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };

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
        logger.warn('signing.cancel_provider_failed', { contractId, err: String(e) });
        captureSigningError('signing.cancel_provider_failed', e, { contractId, providerRef });
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
          recipients: await this.bothPartyRecipients(rfp, pgWsId, tx),
          channels: ['inapp'],
          type: 'signing.canceled',
          title: `[${rfp.code}] 전자서명이 취소됐어요`,
          body: '전자서명이 취소됐어요. 딜룸에서 다시 발송할 수 있어요.',
          linkUrl: (rcpt) => this.partyLink(rcpt, rfp),
        })),
      );
    });
    emitAfterCommit(pendingEmits);
    notifySigningOperator({
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
    if (!rfp || !(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    if (!found.contract.providerRef) return { ok: false, error: 'NOT_SENT' };
    // 쿨다운은 계약 행의 원자 클레임(CAS)이다 — read-then-act 로 하면 판정과 기록
    // 사이에 provider 왕복이 끼어 병렬 요청 N개가 전부 통과한다(연타·양측 클릭은
    // 물론, 인증된 당사자가 고의로 병렬 호출해 상대 메일함과 조직 공유 rate limit
    // 을 태우는 경로까지). 클레임 먼저 → 발송, 발송 실패 시에만 클레임 반납.
    const now = new Date();
    const claimed = await this.signingRepo.claimRemind(
      contractId,
      now,
      new Date(now.getTime() - REMIND_COOLDOWN_MS),
    );
    if (!claimed) return { ok: false, error: 'REMIND_COOLDOWN' };
    try {
      await this.snowsign.remind(found.contract.providerRef);
    } catch (e) {
      const code = e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR';
      // 클레임 반납은 **확실히 실행되지 않은** 실패로 좁힌다 — 5xx·네트워크·형태
      // 불명은 provider 가 이미 리마인더를 보냈을 수 있는 모호 상태고, 여기서
      // 반납하면 에러 문구의 "다시 시도"가 곧 이중 리마인더가 된다(HTTP 계층에서
      // 재시도를 끈 것과 같은 이유). 모호 실패는 클레임을 유지하고 전용 문구로
      // 안내한다(REMIND_UNCONFIRMED — 비용은 확인 못 한 리마인더 1회의 24h 대기).
      if (REMIND_NOT_EXECUTED_CODES.has(code)) {
        // 정확일치 CAS 라 그 사이 성립한 다른 클레임은 건드리지 않는다. 반납 실패는
        // 다음 시도가 24h 를 기다리게 만들 뿐이라 warn 으로만 남긴다.
        try {
          await this.signingRepo.releaseRemindClaim(contractId, now);
        } catch (re) {
          logger.warn('signing.remind_claim_release_failed', { contractId, err: String(re) });
        }
        return { ok: false, error: code };
      }
      return { ok: false, error: 'REMIND_UNCONFIRMED' };
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

  /**
   * 커밋된 사실의 감사 기록 — 실패가 본 동작(전이·발송·알림)을 되돌리면 안 되는
   * 자리 전용(best-effort). 전이 CAS 와 같은 tx 로 묶어 롤백-재시도가 성립하는
   * 자리(ensureFinalized — CAS 가 tx 안에 있다)에는 쓰지 않는다.
   */
  private async auditBestEffort(
    entry: Parameters<AuditLogRepo['insert']>[0],
    logKey: string,
  ): Promise<void> {
    try {
      await this.auditRepo.insert(entry);
    } catch (e) {
      logger.warn(logKey, { err: String(e) });
    }
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
          logger.warn('signing.resend_cancel_failed', { contractId: active.id, err: String(e) });
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
  ): Promise<ServiceResult<{ contract: SigningContract; participants: SigningParticipant[] }>> {
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
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    // 이어받기 알림 수신자를 이 딜의 PG 워크스페이스로 한정하기 위해 필요하다.
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
      const claimed = await this.signingRepo.claimForSend(
        active.id,
        now,
        new Date(now.getTime() - EMBED_SEND_LEASE_MS),
        actor.userId,
      );
      if (!claimed) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
      // (#1) 스테일 ref 정리는 파괴적(cancel+클리어)이라 **리스를 쥔 뒤에만** 한다.
      // 리스 밖에서 하면 동료의 sendFromTemplate 이 왕복 중인 draft 를 죽여, 그
      // 발송이 성공한 뒤 죽은 계약을 가리키는 sent 딜룸이 된다.
      if (active.providerRef) {
        const stop = await this.resolveStaleEmbedRef(active, rfp, actor);
        if (stop) {
          await this.releaseClaimQuietly(active.id, now);
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
        const took = await this.takeOverSendLease(rfp, bidPgWsId, active.id, now, actor, 'embed');
        if (!took.ok) return took;
        // (#1) 이어받기 경로도 리스 취득 이후에만 스테일 ref 를 정리한다.
        if (active.providerRef) {
          const stop = await this.resolveStaleEmbedRef(active, rfp, actor);
          if (stop) {
            await this.releaseClaimQuietly(active.id, now);
            return stop;
          }
        }
      }
      // claimedAt 을 함께 돌려준다 — 화면이 임베드를 닫을 때 이 값으로 리스를 반납한다
      // (`releaseSendEmbedClaim`). 값이 틀리면 repo 의 정확일치 가드가 no-op 으로 삼킨다.
      return { ok: true, iframeUrl: s.iframeUrl, sessionId: s.sessionId, claimedAt: now.toISOString() };
    } catch (e) {
      // 세션도 못 받았는데 리스가 남으면 다음 시도가 리스 만료까지 막힌다.
      // (이어받기 경로는 아직 리스를 잡지 않았으므로 이 반납은 no-op 이다.)
      try {
        await this.signingRepo.releaseSendClaim(active.id, now);
      } catch (re) {
        logger.warn('signing.release_claim_failed', { contractId: active.id, err: String(re) });
      }
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
  }

  /**
   * 연결된 템플릿으로 발송 — 임베드 없이 서버 API 2회(create-contract-from-template
   * + send)로 끝난다. 인터랙티브 세션이 없어 하트비트·이어받기는 필요 없지만, 두
   * 동료가 동시에 눌렀을 때 스노우싸인에 초안이 두 개 쌓이는 것은 막아야 한다 —
   * 기존 발송 리스 claim/release 를 그대로 재사용한다(하트비트 없이 claim→작업→
   * release 한 번. 성공하면 markSentIfAwaiting 이 awaiting 을 벗어나 claim 자체가
   * 의미를 잃는다).
   */
  async sendFromTemplate(
    rfpId: string,
    actor: Actor,
    opts?: { takeOver?: boolean },
  ): Promise<ServiceResult> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 먼저(fail-closed) — 존재 여부를 노출하기 전에 당사자인지 본다.
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    // `let` 인 이유: 리스 획득 뒤 같은 행을 다시 읽어 이 스냅샷을 교체한다(아래).
    let active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    // ⚠️ 이 상태 게이트가 **임베드 바인딩을 초안 출처 게이트 밖에 두는 근거**다.
    // `bindDispatchedContract`/`markSentIfAwaiting` 은 같은 UPDATE 로 awaiting 을
    // 떠나므로, 발송된 계약은 여기서 걸려 아래 재사용 분기에 도달조차 못 한다 —
    // 그래서 임베드 경로에는 출처를 심지 않는다. **이 게이트를 움직이면 그 면역도
    // 함께 움직인다**(임베드가 만든 ref 가 초안처럼 재사용될 수 있게 된다).
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    // 이 지점에서 `rfp.awardedBidId` 는 항상 non-null 이다 — `resolvePartyByRfp` 가
    // 'pg' 를 반환하려면 그 값을 거쳐 actor 가 낙찰 PG 임을 확인했어야 한다. 타입만
    // string|undefined 라 방어적으로 한 번 더 본다(도달 불가, fail-closed).
    if (!rfp.awardedBidId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    // 봉인 경계: `bidRepo.findById()` 가 아니라 좁은 `findSigningTemplateId()` 만 쓴다.
    // `Bid` 도메인 타입에 얹으면 구매사 비교표로 새어 나간다(레포 인터페이스 주석 참조).
    // `bid.pgWsId` 가 필요한 자리는 `actor.workspaceId` 로 대체한다 — 위 ACL 이 이미
    // 둘이 같은 값임을 보장했다.
    const signingTemplateId = await this.bidRepo.findSigningTemplateId(rfp.awardedBidId);
    if (!signingTemplateId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    // `let` 인 이유: 이 읽기는 리스·프로브보다 먼저다 — 재사용 게이트 직전에 다시
    // 읽어 갈아끼운다(아래). 여기서는 빠른 실패(연결 없음·남의 템플릿)만 담당한다.
    let template = await this.templateRepo.findById(signingTemplateId);
    // 소유 확인 — 템플릿 id 를 알아낸 PG 가 남의 계약서로 발송하는 경로를 막는다.
    if (!template || template.workspaceId !== actor.workspaceId) {
      return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    }
    // 종류 게이트 — 이 경로는 **provider 템플릿**으로 계약을 만든다. 조항형 서식은
    // provider 템플릿이 없으므로(문서가 우리 DB 에 있다) 여기로 오면 안 된다.
    // 딜룸이 종류에 따라 갈라 보내므로 UI 로는 도달하지 않지만, 백스톱을 둔다 —
    // 이 한 줄이 아래 다섯 군데의 `template.snowsignTemplateId` 를 **타입 수준에서**
    // 안전하게 만든다(유니온이 여기서 좁혀진다).
    if (template.kind !== 'pdf') return { ok: false, error: 'TEMPLATE_KIND_MISMATCH' };

    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - EMBED_SEND_LEASE_MS),
      actor.userId,
    );
    if (!claimed) {
      if (!opts?.takeOver) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
      // 이어받기 — 임베드·복구 진입점과 같은 계약(UI 확인 뒤에만 takeOver 가 실린다).
      // 임베드는 "세션을 손에 넣은 뒤에 커밋"하지만 여기서는 그 순서를 쓸 수 없다:
      // 이 경로의 공급자 호출이 곧 **발송**이라, 리스를 쥐기 전에 하면 리스가 막으려는
      // 이중 발송 그 자체가 된다. 뺏은 뒤 발송이 실패하면 동료 화면만 닫힌 셈이 되지만,
      // 그 비용은 확인 다이얼로그가 미리 경고한다.
      const took = await this.takeOverSendLease(
        rfp,
        actor.workspaceId,
        active.id,
        now,
        actor,
        'template',
      );
      if (!took.ok) return took;
    }

    // 리스를 쥔 **뒤에** 행을 다시 읽는다. 위 `active` 는 리스 **이전** 스냅샷이라,
    // 그 사이 다른 담당자가 초안을 만들고 발송에 실패한 뒤 리스를 반납했으면 우리는
    // `providerRef` 가 없다고 믿은 채 두 번째 초안을 만들어 **남의 ref 를 덮어쓴다**
    // (그 초안은 취소 핸들을 잃고 공급자 측 고아가 된다). 아래 재사용 판정 전체가
    // 이 스냅샷 위에서 돌아야 한다 — 상호배제 밖에서 읽은 상태로 판정하면 게이트가
    // 아니다. (`createSendEmbedSession` 도 같은 모양이지만 이 PR 범위 밖 — TODOS P3.)
    const fresh = await this.signingRepo.findById(active.id);
    if (!fresh || fresh.contract.status !== 'awaiting_pg_template') {
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'ALREADY_SENT' };
    }
    active = fresh.contract;

    // H3 — 이전 시도의 응답 유실 자가치유. send 가 실제로 성공했는데 응답만 잃었다면
    // 행이 awaiting+providerRef 로 남는다. 그 상태에서 send 를 다시 부르면
    // INVALID_STATUS 로 영구 실패하고(복구 스캔은 자기 ref 라 제외, 폴링은 awaiting
    // 미대상, 7일 넛지는 "올리라"고 오안내) 딜이 영원히 갇힌다 — 재시도 진입에서
    // provider 실상태를 확인해 dispatched 면 재발송 없이 그대로 바인딩한다.
    if (active.providerRef) {
      let stale: SnowSignContractDetail | undefined;
      let probeError: unknown;
      try {
        stale = await this.snowsign.getContract(active.providerRef);
      } catch (e) {
        probeError = e;
        logger.warn('signing.send_probe_failed', { contractId: active.id, err: String(e) });
      }
      if (stale && isDispatchedProviderStatus(stale.status)) {
        const healed = await this.bindDispatchedContract({
          active,
          rfp,
          detail: stale,
          providerContractId: active.providerRef,
          actor,
          source: 'self_heal',
          pgWsId: actor.workspaceId,
        });
        // (#6) 실패면 행이 awaiting 그대로일 수 있다(PERSIST_FAILED 등) — 리스를
        // 풀어야 본인이 5분 self-lock 되지 않는다. PROVIDER_CONTRACT_TAKEN 은 이
        // 경로에선 도달 불가(전역 provider_ref 유니크가 "우리 행이 이미 쥔 ref 를
        // 남이 쥔" 상태 자체를 막는다)지만, 모든 실패에 반납해도 무해한 no-op 이라
        // 방어적으로 넓게 잡는다.
        if (!healed.ok) {
          await this.releaseClaimQuietly(active.id, now);
        }
        return healed;
      }
      if (!stale) {
        // 프로브가 실패했다 — 이 ref 를 재사용해도 되는지 **판정할 수 없다**. 그대로
        // 흘리면 본인인증 없이 만들어진 옛 초안이 그대로 발송되면서 우리 참여자 행에는
        // easy_cert 가 적힌다(아래 재사용 경로는 정책 페이로드를 다시 싣지 않는다).
        // "확인 실패"를 통과로 읽으면 강제가 조용히 꺼지므로, 템플릿 정책 게이트의
        // catch 와 같은 원칙으로 막는다.
        //
        // ref 는 **지우지 않는다**: 일시 실패였는데 그 ref 가 실제로는 dispatched 였다면
        // 지우는 순간 취소 핸들을 잃고 이미 나간 계약이 영구 고아가 된다. 다음 재시도가
        // 다시 프로브하므로 영구 고착도 아니다 — 그래서 리스만 풀고 돌아간다.
        await this.releaseClaimQuietly(active.id, now);
        return {
          ok: false,
          error: probeError instanceof SnowSignError ? probeError.code : 'SNOWSIGN_ERROR',
        };
      }
      const norm = mapProviderContractStatus(stale.status);
      if (norm === 'completed') {
        // 완주한 계약 — 재발송 대상이 아니다. 폴링/reconcile 이 정리하도록 남긴다.
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: 'SNOWSIGN_INVALID_STATUS' };
      }
      if (norm !== undefined) {
        // 종결(canceled/declined/expired) — 죽은 핸들이다. M3 보상 취소가 남긴 ref 가
        // 대표 사례. 그대로 두면 아래 재사용 경로가 죽은 ref 로 send 를 또 불러
        // INVALID_STATUS 영구 데드엔드가 된다 — 지우고 새로 만든다. (로컬 객체도
        // 함께 비워 아래 `let providerRef = active.providerRef` 가 새 생성으로 가게 한다.)
        //
        // clear 는 CAS 다: 프로브 왕복 동안 임베드 attach(리스 무요구)가 같은 행에
        // 실제 발송된 계약을 바인딩했을 수 있다 — id 만 보고 지우면 그 ref 가 사라져
        // "sent + provider_ref NULL = 영구 조정불가" 행이 된다. 실패는 경합으로 물러난다.
        const stop = await this.clearDraftRefOrBackOff(active, active.providerRef, now);
        if (stop) return stop;
      } else if (stale.status.trim().toLowerCase() !== 'draft') {
        // (#9) 분류 불가(미지 status) — 임베드 가드와 대칭으로 fail-closed. 재사용
        // 경로로 흘리면 미지-라이브 계약에 send 를 또 부른다.
        await this.releaseClaimQuietly(active.id, now);
        logger.warn('signing.template_stale_ref_unresolvable', {
          contractId: active.id,
          providerStatus: stale.status,
        });
        return { ok: false, error: 'SNOWSIGN_INVALID_STATUS' };
      } else {
        // 게이트의 비교 기준(지금 연결된 템플릿의 판본)을 프로브 왕복 **뒤에** 다시
        // 읽는다 — 함수 진입 시 스냅샷으로 비교하면, 프로브 동안 커밋된 템플릿 수정
        // (provider id in-place 교체)이 보이지 않아 옛 판끼리 비교해 통과하고 옛 판
        // PDF 가 "연결된 템플릿"으로 나간다. 이후의 정책 게이트·create·draft 기록도
        // 전부 이 재조회본을 쓴다(갈아끼우지 않으면 게이트만 새 판을 보고 create 가
        // 옛 판으로 만든다 — 더 나쁘다).
        const freshTemplate = await this.templateRepo.findById(signingTemplateId);
        if (!freshTemplate || freshTemplate.workspaceId !== actor.workspaceId) {
          await this.releaseClaimQuietly(active.id, now);
          return { ok: false, error: 'NO_LINKED_TEMPLATE' };
        }
        // 재조회본도 종류를 다시 확인한다 — 함수 진입 때의 게이트는 **그때의 스냅샷**을
        // 좁혔을 뿐이고, 이건 프로브 왕복 뒤의 새 읽기다. 레포가 종류 변경을 허용하지
        // 않으므로 실제로는 도달 불가지만, 그 사실을 타입이 알지 못하고 알 필요도 없다.
        if (freshTemplate.kind !== 'pdf') {
          await this.releaseClaimQuietly(active.id, now);
          return { ok: false, error: 'TEMPLATE_KIND_MISMATCH' };
        }
        template = freshTemplate;
        const reusableRef = await this.findReusableTemplateDraftRef(
          active.id,
          template.snowsignTemplateId,
        );
        if (reusableRef === undefined) {
          // 이 초안은 **이 발송이 만든 것이 아니거나 다른 판으로 만들어졌다.** 그대로
          // 재사용하면 화면은 "연결된 템플릿을 보냈다"고 말하는데 실제로는 다른 PDF·
          // 다른 서명칸이 양측에 서명 요청으로 나간다.
          //
          // 두 축이 있고 **인증 판정으로는 둘 다 못 거른다**(양측에 010 번호가 있으면
          // compose 초안도, 옛 판 초안도 전원 identity_verification 이다):
          //   ① 출처가 compose  — `provider_ref` 는 세 경로가 공유하는 슬롯이다
          //   ② 출처는 template 인데 판본이 다름 — 템플릿 수정이 판을 in-place 로
          //      갈아치우므로(그게 수정의 목적) 옛 판 초안이 남는다. compose 없이도
          //      오늘 성립하는 축이다.
          // 출처를 모르는 레거시 행도 여기서 걸린다(fail-closed) — 없는 값을 신뢰로
          // 읽는 것이 v0.4.50.0 fail-open 의 모양이었다.
          //
          // **공급자 초안을 취소하지는 않는다**: 살아 있는 compose 흐름의 것일 수 있다.
          // 우리 ref 만 놓는다 — 발송 전이라 메일도 쿼터도 안 썼고 비용은 고아 초안 하나
          // (바로 아래 미강제-초안 분기와 같은 거래). clear 는 CAS(위 터미널 분기 참조).
          const stop = await this.clearDraftRefOrBackOff(active, active.providerRef, now);
          if (stop) return stop;
          logger.warn('signing.template_draft_origin_mismatch', {
            contractId: active.id,
            templateId: template.snowsignTemplateId,
          });
        } else if (reusableRef !== active.providerRef) {
          // 게이트가 검증한 것은 **지금 DB 의** ref 인데 send 는 리스 직후 스냅샷의
          // ref(`active.providerRef`) 로 나간다 — 둘이 다르면 상태 프로브·인증 판정을
          // 한 번도 통과하지 않은 값이 발송된다. 검증된 쪽으로 갈아타지도 않는다
          // (그 ref 는 위 프로브가 본 계약이 아니다). 경합으로 물러난다.
          await this.releaseClaimQuietly(active.id, now);
          logger.warn('signing.template_draft_ref_diverged', { contractId: active.id });
          return { ok: false, error: 'CONTRACT_BUSY' };
        } else if (!isDraftAuthEnforced(stale)) {
          // 본인인증이 걸리지 않은 초안 — 재사용하면 계약은 이메일 링크로 서명
          // 가능한데 아래에서 참여자 행에 easy_cert 를 적어 딜룸이 거짓말한다.
          // 대표 사례는 v0.4.46.0 **이전에** create 와 send 사이에서 죽은 발송이
          // 남긴 phone 없는 초안이다(그 딜은 템플릿 재저장으로 정책 게이트를 통과한
          // 직후 정확히 이 경로로 들어온다). 종결 ref 와 같은 방식으로 버리고 새로
          // 만든다 — 발송 전이라 메일도 쿼터도 안 썼고, 비용은 공급자 측 고아 초안
          // 하나뿐이다. clear 는 CAS(위 터미널 분기 참조).
          const stop = await this.clearDraftRefOrBackOff(active, active.providerRef, now);
          if (stop) return stop;
          logger.warn('signing.template_draft_auth_not_enforced', {
            contractId: active.id,
            participants: stale.participants.map((p) => p.securityMethod ?? 'none'),
          });
        }
        // 강제된 draft 는 기존 재사용 경로가 send 만 다시 부른다(초안이 여러 개
        // 쌓이는 것을 막는 원래 설계).
      }
    }

    const buyerContact = await this.userRepo.findContactById(rfp.createdBy);
    const pgContact = await this.userRepo.findContactById(actor.userId);
    if (!buyerContact || !pgContact) {
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'CONTACT_NOT_FOUND' };
    }

    // 본인인증 기본강제 — 우리가 만드는 템플릿은 역할 정책이 `easy_cert` 이므로
    // 양측 phone 이 **필수**다. 공급자에 맡기면 VALIDATION_ERROR 400 이 오는데
    // 사용자에게는 원인 없는 실패로 보인다(무엇을 고쳐야 하는지 알 수 없다) —
    // 왕복 전에 막고 누가 무엇을 해야 하는지로 갈라 알려준다. 강등이 아닌 이유는
    // `lib/signing/security-method.ts` 주석 참조(계약별 지정이 불가능하다).
    const buyerSec = resolveSecurityMethod(buyerContact.phone);
    const pgSec = resolveSecurityMethod(pgContact.phone);
    if (!buyerSec.enforced || !pgSec.enforced) {
      await this.releaseClaimQuietly(active.id, now);
      logger.warn('signing.template_send_phone_missing', {
        contractId: active.id,
        buyer: buyerSec.enforced ? 'ok' : buyerSec.reason,
        pg: pgSec.enforced ? 'ok' : pgSec.reason,
      });
      // PG 본인 문제를 먼저 알린다 — 자기 것은 지금 고칠 수 있고, 구매사 것은
      // 기다려야 한다. 둘 다 없으면 행동 가능한 쪽을 먼저 보여주는 게 낫다.
      return { ok: false, error: !pgSec.enforced ? 'PG_PHONE_REQUIRED' : 'BUYER_PHONE_REQUIRED' };
    }

    // 템플릿의 **실제** 역할 정책을 확인한다. 이 기능 이전에 만들어진 템플릿은
    // 기본(email) 정책이라, 그대로 보내면 계약은 이메일 링크로 서명 가능한데
    // 아래 참여자 행에는 easy_cert 가 적혀 타임라인이 거짓말한다. reconcile 이
    // 나중에 바로잡지만 그때는 이미 계약이 나간 뒤 — 강제가 아니다.
    //
    // 값이 없으면 email 과 동일 처리(문서)이므로 정확일치를 요구한다(fail-closed).
    // 이 검사가 마이그레이션 스크립트를 대신한다 — 막힌 PG 가 템플릿을 다시
    // 저장하면 재생성 경로가 easy_cert 를 심어 스스로 풀린다.
    try {
      const detail = await this.snowsign.getTemplate(template.snowsignTemplateId);
      const enforcedRoles = new Set(
        detail.signers.filter((s) => s.securityMethod === 'easy_cert').map((s) => s.roleName),
      );
      if (!SIGNING_ROLE_LABELS.every((role) => enforcedRoles.has(role))) {
        await this.releaseClaimQuietly(active.id, now);
        logger.warn('signing.template_auth_not_enforced', {
          contractId: active.id,
          templateId: template.id,
          signers: detail.signers.map((s) => `${s.roleName}:${s.securityMethod ?? 'none'}`),
          // 0 이 아니면 "정말 미강제 템플릿"이 아니라 공급자 읽기 키 드리프트다 —
          // 그 경우 처방된 복구(재저장)로는 영원히 안 풀리므로 구별이 진단의 전부다.
          signersSkipped: detail.signersSkipped ?? 0,
        });
        return { ok: false, error: 'TEMPLATE_AUTH_NOT_ENFORCED' };
      }
    } catch (e) {
      // 정책을 확인할 수 없으면 보내지 않는다 — "확인 실패"를 통과로 읽으면
      // 강제가 조용히 꺼진 채 계약이 나간다.
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }

    // 재시도 시 이미 만든 draft 가 있으면 재사용 — create 를 다시 부르지 않는다
    // (부분 실패로 스노우싸인 쪽에 초안이 여러 개 쌓이는 것을 막는다).
    // try 밖에 두는 이유: 경합에서 졌을 때 보상 취소가 이 값을 쓴다.
    let providerRef = active.providerRef;
    // 감사에 남길 사실 — 이 발송이 기존 초안을 재사용했는가. 출처 게이트가 **버린**
    // 것은 warn 로그가 알려주지만 "정상 재사용"은 로그를 남기지 않아 사후에 분포를
    // 볼 수 없다. 재사용률이 0으로 붕괴하면 게이트가 과하게 버리고 있다는 신호다
    // (공급자 측 고아 초안이 조용히 쌓인다).
    const draftReused = providerRef !== undefined;
    try {
      if (!providerRef) {
        const created = await this.snowsign.createContractFromTemplate(template.snowsignTemplateId, {
          title: `${rfp.title} 계약서`,
          participants: [
            {
              role: SIGNING_ROLE_LABELS[0],
              name: buyerContact.name,
              email: buyerContact.email,
              phone: buyerSec.phone,
            },
            {
              role: SIGNING_ROLE_LABELS[1],
              name: pgContact.name,
              email: pgContact.email,
              phone: pgSec.phone,
            },
          ],
        });
        providerRef = created.contractId;
        // 발송 **전에** 적어 둔다 — 여기서 죽어도 다음 시도가 같은 초안을 재사용하고,
        // 구매사 취소 경로가 이 값으로 살아있는 계약을 실제로 취소할 수 있다.
        //
        // 출처·판본을 **같은 UPDATE 로** 쓴다: 반쪽만 남으면 다음 재시도가 이 초안을
        // 자기 것으로 알아보지 못하거나(재생성 누적), 남의 초안을 자기 것으로 오인한다.
        const bound = await this.signingRepo.bindDraftRef(active.id, {
          origin: 'template',
          providerRef,
          snowsignTemplateId: template.snowsignTemplateId,
        });
        if (!bound) {
          // CAS 실패 = 리스 획득과 여기 사이에 다른 경로가 ref 를 쥐었다. 우리는 방금
          // 만든 초안의 **유일한 핸들**을 쥐고 있으므로 여기서 취소하지 않으면 공급자
          // 측에 취소 불가 고아가 남는다(삭제 API 없음). 아직 발송 전이라 메일은 0통.
          try {
            await this.snowsign.cancel(providerRef, '중복 초안 정리');
          } catch (ce) {
            logger.warn('signing.template_draft_bind_lost_cancel_failed', {
              contractId: active.id,
              err: String(ce),
            });
          }
          await this.releaseClaimQuietly(active.id, now);
          return { ok: false, error: 'CONTRACT_BUSY' };
        }
      }

      const sent = await this.snowsign.sendContract(providerRef);
      const sentAt = sent.sentAt ?? new Date().toISOString();
      const participants: SigningParticipant[] = [
        {
          id: randomUUID(),
          contractId: active.id,
          userId: rfp.createdBy,
          name: buyerContact.name,
          email: buyerContact.email,
          phone: buyerSec.phone,
          role: 'buyer',
          securityMethod: buyerSec.method,
          status: 'pending',
        },
        {
          id: randomUUID(),
          contractId: active.id,
          userId: actor.userId,
          name: pgContact.name,
          email: pgContact.email,
          phone: pgSec.phone,
          role: 'pg',
          securityMethod: pgSec.method,
          status: 'pending',
        },
      ];

      const pendingEmits: Notification[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._db.transaction(async (tx: any) => {
        // 리스 소유 CAS — SnowSign 왕복(최악 수십 초) 사이에 forceClaimForSend 가
        // 리스를 뺏었으면 상태가 awaiting 그대로여도 여기서 진다. 상태만 보면 뺏긴
        // 발송이 커밋해 계약이 두 건 살아난다(M3).
        const ok = await this.signingRepo.markSentIfAwaiting(
          active.id,
          // providerRef 는 위 create 분기에서 반드시 채워졌지만 `let` 이라 클로저에서
          // 좁힘이 풀린다 — 여기 도달 시 sent.contractId 와 같은 값이다.
          // draft: 템플릿 출처·판본을 유지한다(재사용 케이스는 위 게이트가 판본
          // 일치를 이미 보장) — null 로 지우면 재시도·이력 판정 근거가 사라진다.
          {
            providerRef: providerRef ?? sent.contractId,
            sentAt,
            draft: { origin: 'template', snowsignTemplateId: template.snowsignTemplateId },
          },
          tx,
          { claimedAt: now },
        );
        if (!ok) throw new ContractNoLongerAwaitingError();
        await this.signingRepo.insertParticipants(participants, tx);
        await this.auditRepo.insert(
          {
            actorUserId: actor.userId,
            actorWorkspaceId: actor.workspaceId,
            action: 'signing.sent',
            entityType: 'rfp',
            entityId: rfp.code,
            metadata: { contractId: active.id, providerRef, source: 'template', draftReused },
          },
          tx,
        );
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: await this.bothPartyRecipients(rfp, actor.workspaceId, tx),
            channels: ['inapp'],
            type: 'signing.sent',
            title: `[${rfp.code}] 전자서명이 시작됐어요`,
            body: '이메일로 받은 링크에서 서명을 진행해 주세요.',
            linkUrl: (rcpt) => this.partyLink(rcpt, rfp),
          })),
        );
      });
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
      notifySigningOperator({
        event: 'sent',
        rfpCode: rfp.code,
        rfpTitle: rfp.title,
        round: active.round,
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof ContractNoLongerAwaitingError) {
        // CAS 에서 졌다 — 두 갈래다. ① 상태가 바뀜(구매사 취소·웹훅 종결) ② 상태는
        // awaiting 그대로인데 리스를 뺏김(왕복 중 forceClaimForSend). 어느 쪽이든
        // **이 계약은 우리가 직접 만들고 발송했다** — attach 의 무보상 원칙과 달리
        // 취소 핸들을 우리가 쥐고 있으므로 best-effort 로 보상 취소한다. 살려두면
        // ①에선 취소 CAS 가 patch 를 앞질렀을 때 로컬 참조 없는 살아있는 계약이 남고,
        // ②에선 뺏은 동료의 발송과 서명 요청이 두 벌 돌아다닌다.
        const fresh = await this.signingRepo.findById(active.id);
        const freshStatus = fresh?.contract.status;
        const leaseLost = freshStatus === 'awaiting_pg_template';
        // (#5) 같은 ref 로 이미 **살아있는 발송 상태**가 됐다면 다른 경로(자가치유)가
        // 정당하게 바인딩한 것 — 그 계약은 살아 있고 우리 것이기도 하다. 죽이면 안 된다.
        //
        // 상태를 보지 않고 `!leaseLost` 로만 판정하면 **종결 상태도 여기 걸린다**.
        // 특히 구매사 취소가 왕복 중에 이긴 경우가 위험하다: 취소 경로는 우리가
        // `patchContract` 로 ref 를 적기 전에 읽으면 null 을 보고 provider 취소를
        // 건너뛰는데, 여기서도 건너뛰면 **이미 서명 요청 메일이 나간 계약이 아무도
        // 취소할 수 없는 채로 살아남는다**(행은 terminal 이라 reconcile 도 안 본다).
        const sameRefBound =
          (freshStatus === 'sent' ||
            freshStatus === 'in_progress' ||
            freshStatus === 'completed') &&
          fresh?.contract.providerRef === providerRef;
        if (providerRef && !sameRefBound) {
          try {
            await this.snowsign.cancel(providerRef, '발송 경합 취소');
          } catch (ce) {
            logger.warn('signing.send_race_cancel_failed', {
              contractId: active.id,
              providerRef,
              err: String(ce),
            });
          }
        }
        logger.error('signing.send_from_template_lost_race', {
          contractId: active.id,
          leaseLost,
        });
        captureSigningError('signing.send_from_template_lost_race', e, {
          contractId: active.id,
          rfpCode: rfp.code,
        });
        // 리스를 뺏겼으면 뺏은 쪽이 이어간다 — 화면엔 SEND_TAKEN_OVER 문구가 맞다.
        return { ok: false, error: leaseLost ? 'SEND_TAKEN_OVER' : 'CONTRACT_CHANGED' };
      }
      await this.releaseClaimQuietly(active.id, now);
      logger.error('signing.send_from_template_failed', { contractId: active.id, err: String(e) });
      captureSigningError('signing.send_from_template_failed', e, {
        contractId: active.id,
        rfpCode: rfp.code,
      });
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SEND_FAILED' };
    }
  }

  /**
   * 이 초안이 **지금 보내려는 그 템플릿으로, 템플릿 경로가** 만든 것인가.
   *
   * `isDraftAuthEnforced` 와 묻는 것이 다르다 — 저 술어는 "서명이 어떻게 강제되는가",
   * 이것은 "이 초안이 우리가 보낸다고 말하는 그 문서인가"다. 인증 판정으로는 오문서를
   * 못 거른다: 양측에 010 번호가 있으면 compose 초안도 옛 판 초안도 전원 강제다.
   *
   * fail-closed — 출처를 모르는(레거시·미지값) 행은 재사용하지 않는다.
   *
   * boolean 이 아니라 **검증한 그 ref** 를 돌려준다 — 판정은 지금 DB 를 읽는데 send 는
   * 리스 직후 스냅샷의 ref 로 나가므로, 호출자가 둘의 동일성을 요구하지 않으면 검증을
   * 통과하지 않은 값이 발송될 수 있다(호출부의 divergence 분기가 그 요구다).
   */
  /**
   * 초안 ref 를 CAS 로 지우고, 지면 리스를 반납한 뒤 CONTRACT_BUSY 로 물러난다.
   * 성공 시 로컬 미러(`active.providerRef`)도 비운다. 반환: 물러나면 에러 결과
   * (호출자가 그대로 반환), 진행하면 null.
   *
   * 실패를 warn 으로 남기는 이유: 이 CAS 가 지는 것은 이 게이트가 막으려는 바로 그
   * 경합(프로브 왕복 중 attach 가 발송된 계약을 바인딩)이 실제로 일어났다는 신호다.
   * 로그가 없으면 평범한 리스 경합과 구별되지 않고, 미래의 리팩터가 CAS 를
   * 계통적으로 지게 만들어도 모든 발송이 조용한 CONTRACT_BUSY 로만 퇴화한다.
   */
  /**
   * 조항형(composed) 서식으로 계약을 만들어 발송한다 — **자체 발송 경로**.
   *
   * `sendFromTemplate` 의 골격을 그대로 따르되(ACL → 상태 게이트 → 리스 → 재조회 →
   * 잔여 ref 처리 → 연락처·인증 → create → bind → send → tx 커밋), provider 템플릿
   * 왕복 자리에 **렌더 + 업로드**가 들어간다. 문서가 우리 DB 에 있으므로 딜 값이
   * 딜마다 달라도 고정 PDF 로 굳힐 필요가 없다.
   *
   * ## 초안을 재사용하지 않는다
   *
   * 템플릿 경로는 판본(`snowsignTemplateId`)으로 "이 초안이 지금 연결된 서식으로
   * 만들어졌는가"를 판정해 재사용한다. compose 에는 그 판본이 **없다** —
   * `SigningDraftRef` 의 compose 팔이 구조적으로 갖지 못한다. 그리고 문서는 서식
   * 편집으로도, 딜 값 변화로도 달라진다: "이 초안이 지금 보낼 문서와 같은가"는
   * 유니온이 답할 수 없는 질문이다.
   *
   * 그래서 **프로브 후 폐기**한다. 잃는 것이 없다 — 문서가 우리 DB 에 있어 언제든
   * 다시 렌더되고, 발송 전이라 메일 0통·쿼터 0이다. 대가는 공급자 측 고아 초안
   * 하나이며, 그건 옛 판 문서가 나가는 것보다 훨씬 싸다(v0.4.52.0 이 템플릿 경로에서
   * 막은 바로 그 사고).
   *
   * **프로브가 실패하면 보내지 않고 ref 도 지우지 않는다** — 일시 실패였는데 지우면
   * 실제로는 발송됐을 수 있는 계약의 취소 핸들을 영영 잃는다.
   */
  async sendComposedContract(
    rfpId: string,
    actor: Actor,
    opts?: { takeOver?: boolean },
  ): Promise<ServiceResult> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 먼저(fail-closed) — 존재 여부를 노출하기 전에 당사자인지 본다.
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    let active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    // 상태 게이트 — 발송된 계약은 여기서 걸려 아래 어느 분기에도 도달하지 못한다
    // (`sendFromTemplate` 과 같은 근거: 이 게이트가 임베드 바인딩의 면역이다).
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    if (!rfp.awardedBidId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    // 봉인 경계: 좁은 `findSigningTemplateId()` 만 쓴다(`Bid` 도메인 타입에 얹으면
    // 구매사 비교표로 새어 나간다).
    const signingTemplateId = await this.bidRepo.findSigningTemplateId(rfp.awardedBidId);
    if (!signingTemplateId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    const template = await this.templateRepo.findById(signingTemplateId);
    if (!template || template.workspaceId !== actor.workspaceId) {
      return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    }
    // 종류 게이트 — `sendFromTemplate` 의 대칭. 이 한 줄이 아래 `template.document`
    // 를 타입 수준에서 안전하게 만든다.
    if (template.kind !== 'composed') return { ok: false, error: 'TEMPLATE_KIND_MISMATCH' };

    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - EMBED_SEND_LEASE_MS),
      actor.userId,
    );
    if (!claimed) {
      if (!opts?.takeOver) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
      // 템플릿 경로와 같은 순서 — 이 경로의 공급자 호출이 곧 발송이라 리스를 먼저 쥔다.
      const took = await this.takeOverSendLease(
        rfp,
        actor.workspaceId,
        active.id,
        now,
        actor,
        'compose',
      );
      if (!took.ok) return took;
    }

    // 리스를 쥔 **뒤에** 재조회한다 — 리스 이전 스냅샷으로 판정하면 그 사이 다른
    // 경로가 바인딩한 ref 를 못 보고 덮어쓴다(v0.4.55.0 이 템플릿 경로에서 고친 축).
    const fresh = await this.signingRepo.findById(active.id);
    if (!fresh || fresh.contract.status !== 'awaiting_pg_template') {
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'ALREADY_SENT' };
    }
    active = fresh.contract;

    // ── 잔여 ref: 프로브 후 폐기(재사용 없음) ────────────────────────────────
    if (active.providerRef) {
      const staleRef = active.providerRef;
      let stale: SnowSignContractDetail;
      try {
        stale = await this.snowsign.getContract(staleRef);
      } catch (e) {
        // 확인 못 하면 보내지 않는다. **ref 는 보존한다** — 지우는 순간 실제로는
        // 발송됐을지 모르는 계약의 취소 핸들을 잃는다.
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
      }
      if (isDispatchedProviderStatus(stale.status)) {
        // 이미 나가 있었다 — 두 번 보내지 않고 그 자리에서 바인딩한다(자가치유).
        const healed = await this.bindDispatchedContract({
          active,
          rfp,
          detail: stale,
          providerContractId: staleRef,
          actor,
          source: 'self_heal',
          pgWsId: actor.workspaceId,
        });
        if (healed.ok) return { ok: false, error: 'ALREADY_SENT' };
        await this.releaseClaimQuietly(active.id, now);
        return healed;
      }
      const norm = mapProviderContractStatus(stale.status);
      if (norm === 'completed') {
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: 'SNOWSIGN_INVALID_STATUS' };
      }
      if (norm === undefined && stale.status.trim().toLowerCase() !== 'draft') {
        // 분류 불가(미지 status) — fail-closed. 재사용 경로로 흘리면 미지-라이브
        // 계약에 send 를 또 부른다.
        await this.releaseClaimQuietly(active.id, now);
        logger.warn('signing.composed_stale_ref_unresolvable', {
          contractId: active.id,
          providerStatus: stale.status,
        });
        return { ok: false, error: 'SNOWSIGN_INVALID_STATUS' };
      }
      // 미발송 초안이거나 종결(죽은 핸들) — 폐기하고 새로 만든다.
      // **CAS 가 먼저다**: 프로브 왕복 동안 다른 경로가 이 행에 실제 발송된 계약을
      // 바인딩했을 수 있으므로, 성공한 clear 뒤에만 파괴적 조치를 한다.
      const stop = await this.clearDraftRefOrBackOff(active, staleRef, now);
      if (stop) return stop;
      if (norm === undefined) {
        try {
          await this.snowsign.cancel(staleRef, '미발송 초안 정리');
        } catch (ce) {
          logger.warn('signing.composed_stale_draft_cancel_failed', {
            contractId: active.id,
            err: String(ce),
          });
        }
      }
    }

    const buyerContact = await this.userRepo.findContactById(rfp.createdBy);
    const pgContact = await this.userRepo.findContactById(actor.userId);
    if (!buyerContact || !pgContact) {
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'CONTACT_NOT_FOUND' };
    }

    // 본인인증 기본강제 — **템플릿 경로와 같은 정책(차단)이다.** seam 은 참여자별
    // 강등이 가능하지만 서비스는 쓰지 않는다: ① 강등하면 `signing_participants` 에
    // 적을 method 를 지어내야 하고(비강제 팔에 값이 없다), ② 한 딜룸에 보안 수준이
    // 다른 발송 버튼 둘이 공존하면 막힌 PG 가 서식을 바꿔 게이트를 우회한다.
    // (사용자 결정 2026-08-17 — 2026-08-08 의 "compose 는 강등" 을 뒤집었다.)
    const buyerSec = resolveSecurityMethod(buyerContact.phone);
    const pgSec = resolveSecurityMethod(pgContact.phone);
    if (!buyerSec.enforced || !pgSec.enforced) {
      await this.releaseClaimQuietly(active.id, now);
      logger.warn('signing.composed_send_phone_missing', {
        contractId: active.id,
        buyer: buyerSec.enforced ? 'ok' : buyerSec.reason,
        pg: pgSec.enforced ? 'ok' : pgSec.reason,
      });
      // PG 본인 문제를 먼저 알린다 — 자기 것은 지금 고칠 수 있다.
      return { ok: false, error: !pgSec.enforced ? 'PG_PHONE_REQUIRED' : 'BUYER_PHONE_REQUIRED' };
    }

    // ── 문서 해석 → 렌더 ─────────────────────────────────────────────────────
    //
    // 당사자 **상호**는 워크스페이스 이름이다(담당자 개인 이름이 아니다) — 계약
    // 당사자는 법인이므로 여기서 사람 이름을 쓰면 계약서가 틀린다.
    const [buyerWs, pgWs] = await Promise.all([
      this.workspaceRepo.findById(rfp.buyerWsId),
      this.workspaceRepo.findById(actor.workspaceId),
    ]);
    if (!buyerWs || !pgWs) {
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'COMPOSE_DOCUMENT_INVALID' };
    }
    const rendered = await this.renderComposedDocument({
      template,
      rfp,
      awardedBidId: rfp.awardedBidId,
      buyerCompany: buyerWs.name,
      pgCompany: pgWs.name,
      contractDate: now,
    });
    if (!rendered.ok) {
      await this.releaseClaimQuietly(active.id, now);
      return rendered;
    }

    let providerRef: string | undefined;
    try {
      // 업로드 — 조직 공유 슬롯을 **공급자 호출 앞에서** 잡는다.
      const slot = reserveUploadSlot(actor.workspaceId, rendered.bytes.byteLength);
      if (!slot.ok) {
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: slot.error };
      }
      let uploadId: string;
      try {
        const session = await this.snowsign.createUploadSession({
          purpose: 'contract_document',
          filename: `${rfp.code}-계약서.pdf`,
          contentType: 'application/pdf',
          sizeBytes: rendered.bytes.byteLength,
        });
        bindUploadSlot(slot.slotId, session.uploadId);
        await uploadPdfBytes(session, rendered.bytes, `${rfp.code}-계약서.pdf`);
        uploadId = session.uploadId;
      } catch (e) {
        releaseUploadSlot(slot.slotId);
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
      }

      // ⚠️ 여기부터는 **업로드 슬롯을 반납하지 않는다** — 위 catch 와 의도적으로 다르다.
      // 업로드가 실패하면 공급자 세션은 쓰이지 않았으니 즉시 놓아주는 것이 맞지만, 여기까지
      // 왔다면 세션은 이미 소비됐고 공급자에 해제 엔드포인트가 없다. 슬롯을 붙들고 있는
      // 것이 공급자 상태를 그대로 비추는 셈이고, 같은 워크스페이스가 재시도하면
      // `reserveUploadSlot` 이 자기 예약을 밀어내므로 스스로 잠기지도 않는다.
      // (대가: 실패 한 번이 조직 공유 3슬롯 중 하나를 10분 TTL 만큼 묶는다.)
      const created = await this.snowsign.createContract({
        title: `${rfp.title} 계약서`,
        documentUploadId: uploadId,
        participants: [
          {
            role: SIGNING_ROLE_LABELS[0],
            name: buyerContact.name,
            email: buyerContact.email,
            auth: { phone: buyerSec.phone },
          },
          {
            role: SIGNING_ROLE_LABELS[1],
            name: pgContact.name,
            email: pgContact.email,
            auth: { phone: pgSec.phone },
          },
        ],
        signatureFields: buildSignatureFieldsPayload(rendered.fields),
        externalId: `sc:${active.id}`,
      });
      // 업로드가 계약으로 소비됐다 — TTL(10분)을 기다리지 않고 조직 자리를 돌려준다.
      releaseUploadSlotByUploadId(uploadId);
      providerRef = created.contractId;

      // 발송 **전에** 적어 둔다 — 여기서 죽어도 취소 핸들이 남는다.
      const bound = await this.signingRepo.bindDraftRef(active.id, {
        origin: 'compose',
        providerRef,
      });
      if (!bound) {
        // CAS 실패 = 리스와 여기 사이에 다른 경로가 ref 를 쥐었다. 방금 만든 초안의
        // 유일한 핸들이 우리에게 있으므로 취소하지 않으면 고아가 된다(삭제 API 없음).
        try {
          await this.snowsign.cancel(providerRef, '중복 초안 정리');
        } catch (ce) {
          logger.warn('signing.composed_draft_bind_lost_cancel_failed', {
            contractId: active.id,
            err: String(ce),
          });
        }
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: 'CONTRACT_BUSY' };
      }

      const sent = await this.snowsign.sendContract(providerRef);
      const sentAt = sent.sentAt ?? new Date().toISOString();
      const participants: SigningParticipant[] = [
        {
          id: randomUUID(),
          contractId: active.id,
          userId: rfp.createdBy,
          name: buyerContact.name,
          email: buyerContact.email,
          phone: buyerSec.phone,
          role: 'buyer',
          securityMethod: buyerSec.method,
          status: 'pending',
        },
        {
          id: randomUUID(),
          contractId: active.id,
          userId: actor.userId,
          name: pgContact.name,
          email: pgContact.email,
          phone: pgSec.phone,
          role: 'pg',
          securityMethod: pgSec.method,
          status: 'pending',
        },
      ];

      const pendingEmits: Notification[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._db.transaction(async (tx: any) => {
        const ok = await this.signingRepo.markSentIfAwaiting(
          active.id,
          // 출처를 compose 로 **기록한다** — null 로 지우면 발송된 계약이 출처 미상이
          // 되어 이후 어떤 판독기도 어느 경로로 나갔는지 알 수 없다.
          { providerRef: providerRef ?? sent.contractId, sentAt, draft: { origin: 'compose' } },
          tx,
          { claimedAt: now },
        );
        if (!ok) throw new ContractNoLongerAwaitingError();
        await this.signingRepo.insertParticipants(participants, tx);
        await this.auditRepo.insert(
          {
            actorUserId: actor.userId,
            actorWorkspaceId: actor.workspaceId,
            action: 'signing.sent',
            entityType: 'rfp',
            entityId: rfp.code,
            metadata: {
              contractId: active.id,
              providerRef,
              source: 'compose',
              templateId: template.id,
            },
          },
          tx,
        );
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: await this.bothPartyRecipients(rfp, actor.workspaceId, tx),
            channels: ['inapp'],
            type: 'signing.sent',
            title: `[${rfp.code}] 전자서명이 시작됐어요`,
            body: '이메일로 받은 링크에서 서명을 진행해 주세요.',
            linkUrl: (rcpt) => this.partyLink(rcpt, rfp),
          })),
        );
      });
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
      notifySigningOperator({
        event: 'sent',
        rfpCode: rfp.code,
        rfpTitle: rfp.title,
        round: active.round,
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof ContractNoLongerAwaitingError) {
        // 템플릿 경로와 같은 보상 규율 — 이 계약은 **우리가 만들고 발송했다**.
        const freshAfter = await this.signingRepo.findById(active.id);
        const freshStatus = freshAfter?.contract.status;
        const sameRefBound =
          (freshStatus === 'sent' ||
            freshStatus === 'in_progress' ||
            freshStatus === 'completed') &&
          freshAfter?.contract.providerRef === providerRef;
        if (providerRef && !sameRefBound) {
          try {
            await this.snowsign.cancel(providerRef, '발송 경합 취소');
          } catch (ce) {
            logger.warn('signing.composed_send_race_cancel_failed', {
              contractId: active.id,
              providerRef,
              err: String(ce),
            });
          }
        }
        // CAS 를 졌다는 것은 발송을 뺏겼거나 계약이 왕복 중에 종결됐다는 뜻이다.
        // 기록을 남기지 않으면 평범한 리스 경합과 구별되지 않고, 미래의 리팩터가 CAS 를
        // **계통적으로** 지게 만들어도 모든 발송이 조용한 ALREADY_SENT 토스트로만
        // 퇴화한다(템플릿 경로가 같은 이유로 이 두 줄을 갖고 있다).
        logger.error('signing.send_composed_lost_race', {
          contractId: active.id,
          freshStatus,
          sameRefBound,
        });
        captureSigningError('signing.send_composed_lost_race', e, {
          contractId: active.id,
          rfpCode: rfp.code,
        });
        await this.releaseClaimQuietly(active.id, now);
        return {
          ok: false,
          error: freshStatus === 'awaiting_pg_template' ? 'SEND_TAKEN_OVER' : 'ALREADY_SENT',
        };
      }
      captureSigningError('composed_send_failed', e, { contractId: active.id });
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SEND_FAILED' };
    }
  }

  /**
   * 저장된 조항 문서를 딜 값으로 해석해 PDF 로 렌더한다.
   *
   * 해석 뒤 **다시 글리프 커버리지를 본다** — 구매사 상호·담당자 이름은 이 시점에야
   * 문서에 들어오므로, 저장 시 검증만으로는 한자 상호가 조용한 빈칸으로 서명된다.
   */
  private async renderComposedDocument(input: {
    template: PgSigningTemplate & { kind: 'composed' };
    rfp: RFP;
    awardedBidId: string;
    buyerCompany: string;
    pgCompany: string;
    contractDate: Date;
  }): Promise<
    | { ok: true; bytes: Uint8Array; fields: SigningTemplateFieldInput[] }
    | { ok: false; error: string }
  > {
    const bid = await this.bidRepo.findById(input.awardedBidId);
    if (!bid) return { ok: false, error: 'COMPOSE_DOCUMENT_INVALID' };

    const resolved = resolveContractDoc(input.template.document, {
      buyerCompany: input.buyerCompany,
      pgCompany: input.pgCompany,
      contractDate: input.contractDate,
      settleCycle: bid.settleCycle,
      settleLimit: bid.settleLimit,
      guaranteeInsurance: bid.guaranteeInsurance,
      signupFee: bid.signupFee,
    });
    if (!resolved.ok) {
      logger.warn('signing.composed_unknown_tokens', {
        templateId: input.template.id,
        tokens: resolved.unknownTokens,
      });
      return { ok: false, error: 'COMPOSE_DOCUMENT_INVALID' };
    }

    // 해석된 문서로 커버리지 재검증 — 저장 시 검증이 못 본 문자가 여기서 들어온다.
    //
    // ⚠️ 검사 대상은 **PDF 에 인쇄되는 것 전부**여야 한다. 조항 텍스트만 보면 두 부류가
    // 게이트를 통째로 건너뛴다: ① 수수료 표 라벨 — 출처가 `rfp.customPaymentMethods` 라
    // **구매사 자유 입력**이고 문자셋 제한이 없다, ② 당사자 사업자등록번호. 빠뜨리면
    // 그 자리가 **서명된 계약서에서 빈칸**이 되고, 보내는 PG 는 남의 워크스페이스가 쓴
    // 라벨을 고칠 수도 없다. 그래서 표를 커버리지 검사보다 **먼저** 만든다.
    const coverage = await loadGlyphCoverage();
    try {
      const feeRows = buildFeeTableRows({
        paymentFees: bid.paymentFees,
        customFees: bid.customFees,
        customMethods: input.rfp.customPaymentMethods,
      });
      const bizNo = input.rfp.bizProfile?.bizNo;
      const missing = missingGlyphs(
        [
          resolved.doc.title,
          resolved.doc.preamble,
          resolved.doc.closing,
          input.buyerCompany,
          input.pgCompany,
          ...(bizNo ? [bizNo] : []),
          ...feeRows.flatMap((r) => [r.label, r.value]),
          ...resolved.doc.clauses.flatMap((c) =>
            c.kind === 'text' ? [c.heading, c.body] : [c.heading, c.intro, c.outro],
          ),
        ].join('\n'),
        coverage,
      );
      if (missing.length > 0) {
        logger.warn('signing.composed_unsupported_characters', {
          templateId: input.template.id,
          characters: missing,
        });
        return { ok: false, error: 'COMPOSE_UNSUPPORTED_CHARACTER' };
      }

      const out = await renderContractPdf({
        doc: resolved.doc,
        feeRows,
        parties: {
          buyer: { company: input.buyerCompany, bizNo },
          pg: { company: input.pgCompany },
        },
      });
      return { ok: true, bytes: out.bytes, fields: out.fields };
    } catch (e) {
      logger.error('signing.composed_render_failed', {
        templateId: input.template.id,
        err: String(e),
      });
      return { ok: false, error: 'COMPOSE_RENDER_FAILED' };
    }
  }

  private async clearDraftRefOrBackOff(
    active: SigningContract,
    expectedRef: string,
    now: Date,
  ): Promise<{ ok: false; error: string } | null> {
    if (!(await this.signingRepo.clearDraftRefIf(active.id, expectedRef))) {
      logger.warn('signing.draft_clear_cas_lost', { contractId: active.id });
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'CONTRACT_BUSY' };
    }
    active.providerRef = undefined;
    return null;
  }

  private async findReusableTemplateDraftRef(
    contractId: string,
    templateProviderId: string,
  ): Promise<string | undefined> {
    const draft = await this.signingRepo.findDraftRef(contractId);
    return draft?.origin === 'template' && draft.snowsignTemplateId === templateProviderId
      ? draft.providerRef
      : undefined;
  }

  private async releaseClaimQuietly(contractId: string, claimedAt: Date): Promise<void> {
    try {
      await this.signingRepo.releaseSendClaim(contractId, claimedAt);
    } catch (re) {
      logger.warn('signing.release_claim_failed', { contractId, err: String(re) });
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
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
    if (isDispatchedProviderStatus(stale.status)) {
      // 실제로 발송돼 있었다 — 임베드로 두 번째 계약을 만들게 하지 않고 그 자리에서
      // 바인딩한다(H3 자가치유와 같은 커밋 지점). 성공하면 화면은 ALREADY_SENT 를
      // 받고 새로고침해 sent 카드를 본다.
      const healed = await this.bindDispatchedContract({
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
    if (norm === 'completed' || (norm === undefined && stale.status.trim().toLowerCase() !== 'draft')) {
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
    // TODOS.md Signing 절 "resolveStaleEmbedRef 가 compose 초안을 무조건 취소한다".
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
  ): Promise<ServiceResult<{ holder: { userId: string; name: string } | null; isSelf: boolean }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const lease = await this.signingRepo.findSendLease(active.id);
    if (!lease?.holderUserId) return { ok: true, holder: null, isSelf: false };

    // 쥔 게 자기 자신인지 알려준다 — 그 경우 화면은 이어받기를 제안하면 안 된다.
    // 이어받게 두면 같은 사람의 iframe 이 둘 살아나는데(알림은 자기에게 가지 않으므로
    // 옛 탭이 닫히지 않는다) 그건 이 기능이 막으려는 상태 그 자체다.
    const isSelf = lease.holderUserId === actor.userId;
    const member = (await this.workspaceRepo.teamRoster(actor.workspaceId)).find(
      (m) => m.userId === lease.holderUserId,
    );
    return {
      ok: true,
      holder: member ? { userId: member.userId, name: member.name } : null,
      isSelf,
    };
  }

  /**
   * 발송 리스 강제 이어받기 — 밀려난 동료에게 알리고 감사 기록을 남긴다.
   *
   * **알림이 곧 차단 신호다.** 스노우싸인에 임베드 세션을 취소하는 API 가 없어서
   * 뺏어도 동료의 iframe 은 살아 있다. 발송 버튼은 우리 페이지 안에만 있으므로,
   * 이 알림이 SSE 로 그 사람 브라우저에 닿아 패널을 즉시 내리는 것이 실제 차단이다
   * (하트비트는 실시간이 죽었을 때의 폴백으로 남는다).
   */
  private async takeOverSendLease(
    rfp: RFP,
    pgWsId: string,
    contractId: string,
    now: Date,
    actor: Actor,
    // 감사 메타에만 실린다. `recovery` 는 Wave 3 에서 사라졌다(스캔은 강제 취득을
    // 하지 않는다) — 파괴적 취득의 진입점은 임베드와 템플릿 지름길 둘뿐이다.
    surface: 'embed' | 'template' | 'compose',
  ): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    let taken = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      const r = await this.signingRepo.forceClaimForSend(contractId, now, actor.userId, tx);
      if (!r.taken) return;
      taken = true;
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'signing.send_claim_taken',
          entityType: 'rfp',
          entityId: rfp.code,
          metadata: { contractId, displacedUserId: r.displacedUserId, surface },
        },
        tx,
      );
      // 뺏은 사람에게는 보내지 않는다. 같은 사람이 두 탭을 연 경우도 여기서 걸린다.
      if (!r.displacedUserId || r.displacedUserId === actor.userId) return;
      const member = (await this.workspaceRepo.approvedMemberRecipients(pgWsId, tx)).find(
        (m) => m.userId === r.displacedUserId,
      );
      if (!member) return;
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: [{ userId: member.userId, workspaceId: pgWsId, email: member.email }],
          // 인앱만 — 위험한 창이 몇 분인데 이메일은 그보다 늦게 도착한다.
          channels: ['inapp'],
          type: 'signing.send_taken_over',
          title: `[${rfp.code}] 다른 담당자가 계약서 작성을 이어받았어요`,
          body: '작성 중이던 화면은 이제 쓸 수 없어요. 그 화면에서 발송하면 계약서가 두 번 나가요.',
          linkUrl: `/inbox/${rfp.code}`,
        })),
      );
    });
    if (!taken) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
    return { ok: true };
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
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const current = new Date(claimedAt);
    if (Number.isNaN(current.getTime())) return { ok: false, error: 'INVALID_INPUT' };

    const next = new Date();
    const renewed = await this.signingRepo.renewSendClaim(active.id, current, next);
    if (!renewed) {
      // 뺏긴 것과 그냥 만료된 것은 사용자에게 다른 사건이다 — 전자는 "이 화면에서
      // 보내지 마세요"가 필요하고(스노우싸인에 세션 취소 API 가 없어 화면이 살아
      // 있을 수 있다), 후자는 그냥 다시 열면 되는 경합이다.
      //
      // 가르는 건 **소유자**지 타임스탬프가 아니다. 자기 자신의 낡은 토큰으로 연장을
      // 시도하는 경우(연장 응답을 못 받은 뒤 재시도)도 타임스탬프는 어긋나는데,
      // 그건 뺏긴 게 아니라 그냥 경합이다.
      const lease = await this.signingRepo.findSendLease(active.id);
      if (lease?.holderUserId && lease.holderUserId !== actor.userId) {
        return { ok: false, error: 'SEND_TAKEN_OVER' };
      }
      return { ok: false, error: 'CONTRACT_BUSY' };
    }
    return { ok: true, claimedAt: next.toISOString() };
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
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    // 이미 발송됐으면 리스는 의미가 없다(claimForSend 는 awaiting 에서만 성공한다).
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const at = new Date(claimedAt);
    if (Number.isNaN(at.getTime())) return { ok: false, error: 'INVALID_INPUT' };
    try {
      await this.signingRepo.releaseSendClaim(active.id, at);
    } catch (e) {
      // 반납 실패는 사용자에게 알릴 일이 아니다 — 최악이라도 5분 뒤 자동으로 풀린다.
      logger.warn('signing.release_embed_claim_failed', { contractId: active.id, err: String(e) });
    }
    return { ok: true };
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
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };
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
        await this.ensureFinalizedIfProviderCompleted(active.id, providerContractId);
      }
      return { ok: true };
    }
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    // 같은 provider 계약을 두 계약 행이 쥐면 상태·완료본이 서로를 덮어쓴다.
    const bound = await this.signingRepo.findByProviderRef(providerContractId);
    if (bound && bound.id !== active.id) return { ok: false, error: 'PROVIDER_CONTRACT_TAKEN' };

    let detail;
    try {
      detail = await this.snowsign.getContract(providerContractId);
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
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

    return this.bindDispatchedContract({
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


  /**
   * dispatched 가 확인된 provider 계약을 계약 행에 바인딩하는 **유일한 커밋 지점** —
   * attach(임베드 postMessage·복구)와 자가치유(sendFromTemplate·createSendEmbedSession
   * 의 providerRef 선존재)가 공유한다. 두 번째 바인딩 경로를 만들지 않는다.
   * 전제: 호출자가 ACL·dispatched 게이트를 이미 통과시켰다.
   */
  private async bindDispatchedContract(args: {
    active: SigningContract;
    rfp: RFP;
    detail: SnowSignContractDetail;
    providerContractId: string;
    actor: Actor;
    source: 'embed' | 'recovery' | 'self_heal';
    pgWsId: string;
    pgSubmittedBy?: string;
  }): Promise<ServiceResult<{ participantMismatch?: boolean }>> {
    const { active, rfp, detail, providerContractId, actor, source, pgWsId, pgSubmittedBy } = args;
    const buyerEmail = (await this.userRepo.findContactById(rfp.createdBy))?.email.toLowerCase();
    const pgEmail = pgSubmittedBy
      ? (await this.userRepo.findContactById(pgSubmittedBy))?.email.toLowerCase()
      : undefined;
    const now = new Date();
    const participants: SigningParticipant[] = detail.participants.map((p) => {
      const email = p.email.toLowerCase();
      // 구매사 담당과 일치하는 사람만 buyer 로 본다. 나머지는 PG 가 자기 쪽에 추가한
      // 사람으로 취급한다 — 구매사 오타는 아래 participantMismatch 가 잡는다.
      const isBuyer = !!buyerEmail && email === buyerEmail;
      return {
        id: randomUUID(),
        contractId: active.id,
        userId: isBuyer ? rfp.createdBy : email === pgEmail ? pgSubmittedBy : undefined,
        name: p.name,
        email: p.email,
        phone: p.phone,
        role: isBuyer ? ('buyer' as const) : ('pg' as const),
        securityMethod:
          p.securityMethod === PROVIDER_ENFORCED_SECURITY_METHOD ? 'easy_cert' : 'email',
        status: mapProviderParticipantStatus(p.status) ?? 'pending',
        signedAt: p.signedAt,
        emailDelivery: p.emailDelivery,
      };
    });
    const participantMismatch =
      !!buyerEmail && !detail.participants.some((p) => p.email.toLowerCase() === buyerEmail);

    const pendingEmits: Notification[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._db.transaction(async (tx: any) => {
        const claimed = await this.signingRepo.markSentIfAwaiting(
          active.id,
          {
            providerRef: providerContractId,
            // 복구·자가치유는 과거 발송을 뒤늦게 잇는 것 — provider 가 기억하는
            // 시각·상태를 우선한다(sent 강등이면 이미 서명한 사람에게 "서명해
            // 주세요" 알림이 간다).
            sentAt: detail.sentAt ?? now.toISOString(),
            status:
              mapProviderContractStatus(detail.status) === 'in_progress' ? 'in_progress' : 'sent',
            // 임베드 attach·복구·자가치유 — 초안 출처가 없다. 남아 있던 template
            // 출처·판본을 이 계약이 입지 않도록 같은 UPDATE 로 지운다.
            draft: null,
          },
          tx,
        );
        if (!claimed) throw new ContractNoLongerAwaitingError();
        await this.signingRepo.insertParticipants(participants, tx);
        await this.auditRepo.insert(
          {
            actorUserId: actor.userId,
            actorWorkspaceId: actor.workspaceId,
            action: 'signing.sent',
            entityType: 'rfp',
            entityId: rfp.code,
            metadata: {
              contractId: active.id,
              providerRef: providerContractId,
              participantMismatch,
              source,
            },
          },
          tx,
        );
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: await this.bothPartyRecipients(rfp, pgWsId, tx),
            channels: ['inapp'],
            type: 'signing.sent',
            // 복구는 이미 발송돼 있던 계약을 잇는 것 — 새 발송처럼 말하면
            // 며칠 전에 온 메일을 다시 기다리게 만든다.
            // (#8) 새 발송 문구는 임베드(방금 발송)에만 — 복구·자가치유는 임의로
            // 오래된 계약을 잇는 것이라 "시작됐어요"라고 말하면 며칠 전에 온 메일을
            // 다시 기다리게 만든다.
            title:
              source !== 'embed'
                ? `[${rfp.code}] 보낸 계약서를 딜룸에 연결했어요`
                : `[${rfp.code}] 전자서명이 시작됐어요`,
            body:
              source !== 'embed'
                ? '이미 발송된 계약서를 딜룸에 연결했어요. 서명 진행 상황이 그대로 반영돼요.'
                : '이메일로 받은 링크에서 서명을 진행해 주세요.',
            linkUrl: (rcpt) => this.partyLink(rcpt, rfp),
          })),
        );
      });
    } catch (e) {
      // **보상 취소하지 않는다** — 이 계약은 우리가 만든 게 아니라 PG 가 임베드에서
      // 직접 발송한 것이고, 양측에 이미 서명 요청 메일이 나갔다. 여기서 취소하면
      // 로컬 저장 실패라는 우리 사정으로 살아있는 계약을 죽이는 셈이다.
      // 바인딩은 멱등이므로 복구 경로가 다시 붙이면 된다(performSend 와 다른 점).
      if (e instanceof ContractNoLongerAwaitingError) {
        logger.warn('signing.attach_lost_race', {
          contractId: active.id,
          providerRef: providerContractId,
        });
        return { ok: false, error: 'CONTRACT_CHANGED' };
      }
      if (isProviderRefConflict(e)) {
        // 동시 요청에 졌다. 이 스노우싸인 계약은 다른 계약 행이 쥐었다.
        logger.warn('signing.attach_provider_ref_conflict', {
          contractId: active.id,
          providerRef: providerContractId,
        });
        return { ok: false, error: 'PROVIDER_CONTRACT_TAKEN' };
      }
      logger.error('signing.attach_persist_failed', {
        contractId: active.id,
        providerRef: providerContractId,
        err: String(e),
      });
      captureSigningError('signing.attach_persist_failed', e, {
        contractId: active.id,
        providerRef: providerContractId,
        rfpCode: rfp.code,
      });
      return { ok: false, error: 'PERSIST_FAILED' };
    }

    emitAfterCommit(pendingEmits);
    flushAfterCommit();
    notifySigningOperator({
      // 임베드는 방금 발송된 계약, 복구·자가치유는 이미 발송돼 있던 계약의 연결 —
      // 인앱 알림 문구 분기와 같은 구분을 운영자 채널에도 유지한다.
      event: source === 'embed' ? 'sent' : 'attached',
      rfpCode: rfp.code,
      rfpTitle: rfp.title,
      round: active.round,
    });

    // 완료된 고아를 이었다면 종결까지 밀어 준다. **새 종결 전이를 만들지 않고**
    // 기존 단일 경로(`ensureFinalized`)를 그대로 태운다 — 원자 CAS·감사·완료 알림이
    // 이미 그 한 곳에 있고 멱등이라 두 번 불려도 안전하다. 알림이 '연결했어요' 뒤에
    // '서명 완료' 로 두 번 나가는 것은 사실 그대로의 서술이다.
    if (mapProviderContractStatus(detail.status) === 'completed') {
      // **바인딩은 이미 커밋됐다.** 여기서 던지면 성공한 연결이 화면엔 실패로 보이고
      // (다이얼로그가 LINK_FAILED 로 옮긴다) 사용자는 '다시 시도' 하는데, 재시도는 위
      // 멱등 분기에서 곧바로 ok 로 빠져 종결이 영영 안 일어난다. 종결은 폴링·lazy
      // reconcile 이 백스톱으로 갖고 있으므로(POLLABLE 에 sent 포함) 삼키고 남긴다.
      try {
        await this.ensureFinalized(active.id);
      } catch (e) {
        logger.error('signing.bind_finalize_failed', { contractId: active.id, err: String(e) });
        captureSigningError('signing.bind_finalize_failed', e, {
          contractId: active.id,
          rfpCode: rfp.code,
        });
      }
    }
    return { ok: true, participantMismatch };
  }

  /** 공급자가 completed 라고 답할 때만 종결을 민다(멱등). 실패는 폴링이 만회한다. */
  private async ensureFinalizedIfProviderCompleted(
    contractId: string,
    providerRef: string,
  ): Promise<void> {
    try {
      const detail = await this.snowsign.getContract(providerRef, { maxRetries: 1 });
      if (mapProviderContractStatus(detail.status) === 'completed') {
        await this.ensureFinalized(contractId);
      }
    } catch (e) {
      logger.warn('signing.reattach_finalize_probe_failed', { contractId, err: String(e) });
    }
  }

  /**
   * 고아 복구 후보 — 발송은 실제로 됐는데 완료 postMessage 가 유실돼 대기에 갇힌
   * 계약을 **찾아서 PG 에게 보여준다**. 채택하지 않는다: 고른 뒤 연결하는 건
   * `attachProviderContract` 이고, 고르는 건 사람이다.
   *
   * 자동 채택을 하지 않는 이유가 곧 이 설계의 근거다 — 상관키(참여자 이메일)는
   * 휴리스틱이고, 기계가 틀리면 남의 계약이 이 딜룸에 붙는다. 사람은 자기가 방금
   * 보낸 계약서를 알아본다.
   *
   * 스캔 중에는 발송 리스를 잡는다. 담당자 둘이 동시에 스캔하지 않고, 임베드를
   * 작성 중인 사람과도 상호배타가 된다(리스 의미를 넓혀 쓰는 것이므로 명시해 둔다).
   */
  async listRecoveryCandidates(
    rfpId: string,
    actor: Actor,
  ): Promise<ServiceResult<{ candidates: SigningRecoveryCandidate[]; truncated: boolean }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 이 먼저다 — 존재 오라클도, 남의 딜로 예산을 태우는 것도 막는다.
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const buyerSigner = await this.userRepo.findContactById(rfp.createdBy);
    const buyerEmail = buyerSigner?.email.toLowerCase();
    const pgEmails = new Set(
      (await this.workspaceRepo.approvedMemberRecipients(bid.pgWsId)).map((m) =>
        m.email.toLowerCase(),
      ),
    );
    if (!buyerEmail || pgEmails.size === 0) {
      logger.info('signing.recover_abstained', { contractId: active.id, reason: 'no_emails' });
      return { ok: true, candidates: [], truncated: false };
    }

    // **이 경로는 절대 뺏지 않는다.** 스캔은 읽기인데 강제 취득은 동료의 임베드를
    // 닫고 그 사람이 올리던 PDF·서명칸을 없앤다 — 목록만 보려던 클릭이 남의 작업을
    // 죽이면 안 된다. 파괴적 조작의 진입점은 임베드('계약서 올리기') 하나로 모은다.
    // 리스는 여전히 잡는다(작성 중인 담당자와 상호배타) — 다만 비어 있을 때만.
    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - EMBED_SEND_LEASE_MS),
      actor.userId,
    );
    if (!claimed) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SIGNING_RECOVERY_DEADLINE_MS);
    try {
      return await this.scanRecoveryCandidates(active, buyerEmail, pgEmails, ac.signal);
    } catch (e) {
      logger.warn('signing.recover_scan_failed', { contractId: active.id, err: String(e) });
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    } finally {
      clearTimeout(timer);
      // 리스는 무조건 돌려준다 — 안 그러면 실패 한 번이 5분을 잠근다.
      try {
        await this.signingRepo.releaseSendClaim(active.id, now);
      } catch (re) {
        logger.warn('signing.recover_release_failed', {
          contractId: active.id,
          err: String(re),
        });
      }
    }
  }

  private async scanRecoveryCandidates(
    active: SigningContract,
    buyerEmail: string,
    pgEmails: ReadonlySet<string>,
    signal: AbortSignal,
  ): Promise<ServiceResult<{ candidates: SigningRecoveryCandidate[]; truncated: boolean }>> {
    // 정렬 순서가 문서에 없다 — 오래된 순이면 1페이지가 쓸모없다. 페이지가 여러 장이면
    // 마지막 장도 받아 어느 쪽 끝에 최신이 있든 확보하고, 받은 뒤 직접 정렬한다.
    let truncated = false;
    const seen = new Map<string, SnowSignContractSummary>();
    for (const status of RECOVERY_SCAN_STATUSES) {
      const first = await this.snowsign.listContracts({ status, perPage: 100, page: 1, signal, maxRetries: 1 });
      for (const r of first.rows) seen.set(r.contractId, r);
      if (first.totalPages > 1) {
        truncated = true;
        const last = await this.snowsign.listContracts({
          maxRetries: 1,
          status,
          perPage: 100,
          page: first.totalPages,
          signal,
        });
        for (const r of last.rows) seen.set(r.contractId, r);
      }
    }

    const floor = new Date(active.createdAt).getTime() - RECOVERY_CLOCK_SKEW_MS;
    // 값싼 판정(생성시각)을 먼저 — 선정보다 먼저 만들어진 계약일 수 없다
    // (목록이 created_at 을 줄 때만 판정 가능).
    const dated = [...seen.values()].filter(
      (row) => !(row.createdAt && new Date(row.createdAt).getTime() < floor),
    );
    if (signal.aborted) truncated = true;
    // "이미 다른 행이 쥐었나"는 **한 번에** 묻는다. 행마다 SELECT 를 때리면 최대
    // ~400회 순차 왕복이 12초 데드라인을, 그것도 발송 리스를 쥔 채 태운다.
    const bound = signal.aborted
      ? new Set<string>()
      : await this.signingRepo.findBoundProviderRefs(dated.map((r) => r.contractId));
    const pool = dated.filter((row) => !bound.has(row.contractId));
    pool.sort((a, b) => (b.sentAt ?? b.createdAt ?? '').localeCompare(a.sentAt ?? a.createdAt ?? ''));
    if (pool.length > RECOVERY_MAX_DETAIL_LOOKUPS) truncated = true;
    // **예산은 dispatched 에 먼저 배정한다.** 완료 버킷은 단조 증가한다 — 조직의 모든
    // 계약이 결국 거기로 가고, 딜이 대기에 오래 있을수록(=고아 상황) 더 쌓인다. 최신순
    // 하나로 12칸을 자르면 정작 찾아야 할 진짜 고아(pending/in_progress)가 통째로
    // 밀려나고, 화면은 0건 → '계약서 올리기' 로 유도해 **이 기능이 막으려던 두 번째
    // 발송이 정상 경로가 된다**(실측 재현: 무관한 완료 20건이면 자기 계약이 사라진다).
    // 각 하위 풀은 위 정렬 순서를 그대로 유지한다(filter 는 순서를 보존한다).
    const dispatchedFirst = pool.filter((r) => isDispatchedProviderStatus(r.status));
    const completedLast = pool.filter((r) => !isDispatchedProviderStatus(r.status));
    const targets = [...dispatchedFirst, ...completedLast].slice(0, RECOVERY_MAX_DETAIL_LOOKUPS);

    const candidates: SigningRecoveryCandidate[] = [];
    for (let i = 0; i < targets.length; i += RECOVERY_DETAIL_CONCURRENCY) {
      if (signal.aborted) {
        truncated = true;
        break;
      }
      const wave = await Promise.all(
        targets.slice(i, i + RECOVERY_DETAIL_CONCURRENCY).map(async (row) => {
          try {
            return { row, detail: await this.snowsign.getContract(row.contractId, { signal, maxRetries: 1 }) };
          } catch {
            // 한 건 실패가 스캔 전체를 무너뜨리지는 않지만, **조용히** 넘기면 안 된다 —
            // 429 소진·5xx 로 진짜 후보가 떨어져 나갔는데 truncated 가 false 면 화면이
            // "찾지 못했어요"→'계약서 올리기'로 유도해 이중 발송을 만든다.
            truncated = true;
            return null;
          }
        }),
      );
      for (const hit of wave) {
        if (!hit) continue;
        const { row, detail } = hit;
        if (!isRecoverableProviderStatus(detail.status)) continue;
        // 상세에도 생성시각 하한을 건다 — 목록이 created_at 을 안 주는 경우가 있고,
        // 선정 이전에 만들어진 계약은 이 딜의 것일 수 없다.
        if (detail.createdAt && new Date(detail.createdAt).getTime() < floor) continue;
        if (!participantsMatchDeal(detail.participants, buyerEmail, pgEmails)) continue;
        candidates.push({
          // 공급자가 echo 한 값이 아니라 **우리가 요청한 id** 를 쓴다 — 이 값이 곧
          // 바인딩 대상이라, echo 를 믿으면 엉뚱한 계약을 붙일 여지가 생긴다.
          providerContractId: row.contractId,
          // 공급자가 준 문자열이다 — 길이를 서버에서 자른다(레이아웃 방어).
          title: (detail.title ?? '').trim().slice(0, 120) || '제목 없는 계약서',
          sentAt: detail.sentAt ?? row.sentAt,
          createdAt: detail.createdAt ?? row.createdAt,
          participantCount: detail.participants.length,
          // 완료 고아는 화면이 따로 떼어 보여주고 자동 선택하지 않는다 — 잘못 붙이면
          // 서명 완료된 남의 문서 다운로드가 이 딜룸에 열린다.
          alreadyCompleted: mapProviderContractStatus(detail.status) === 'completed',
        });
      }
    }

    if (candidates.length === 0) {
      // 0건이 흔한 결과라, 왜 0건인지를 남겨야 상관키가 너무 빡빡한 것과 진짜 아무것도
      // 없는 것을 운영에서 구분할 수 있다.
      logger.info('signing.recover_abstained', {
        contractId: active.id,
        reason: pool.length === 0 ? 'no_unbound' : 'email_mismatch',
        pool: pool.length,
        truncated,
      });
    }
    // 브라우저로 내보내기 **직전에** 노출 사실을 남긴다. 이 기록이 바인딩 게이트의
    // 근거이므로, 기록 없이 목록만 나가면 그 id 는 게이트를 통과하지 못한 채 PG 만
    // 아는 값이 된다(= 지금 닫으려는 구멍 그 자체). 대체 저장이라 라운드마다 갈린다.
    await this.signingRepo.recordRecoveryDisclosure(
      active.id,
      candidates.map((c) => c.providerContractId),
    );
    return { ok: true, candidates, truncated };
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
      // 폴링·lazy reconcile 은 다음 틱이 만회한다 — 재시도 예산 1.
      detail = await this.snowsign.getContract(contract.providerRef, { maxRetries: 1 });
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
        if (!local) continue;
        const partPatch: SigningParticipantPatch = {};
        const mapped = mapProviderParticipantStatus(pp.status);
        // 단조 전이만 반영: 미지값(undefined)·이미 종결(signed/rejected)·역행(순위 하락)은
        // 무시해 비정상/재전송 스냅샷이 이미 서명한 참여자를 pending 으로 되돌리지 못하게 한다.
        if (
          mapped &&
          mapped !== local.status &&
          !FINAL_PARTICIPANT_STATUSES.has(local.status) &&
          PARTICIPANT_RANK[mapped] >= PARTICIPANT_RANK[local.status]
        ) {
          partPatch.status = mapped;
          partPatch.signedAt = pp.signedAt ?? undefined;
        }
        // 이메일 전달 상태는 상태 전이와 독립으로 미러링 — 반송(bounced)은 화면의
        // 지속 경고가 소비한다.
        if (pp.emailDelivery && pp.emailDelivery !== local.emailDelivery) {
          partPatch.emailDelivery = pp.emailDelivery;
        }
        if (Object.keys(partPatch).length > 0) {
          await this.signingRepo.patchParticipant(local.id, partPatch, tx);
        }
      }
      const patch = { lastPolledAt: new Date().toISOString() } as {
        lastPolledAt: string;
        status?: SigningContractStatus;
        expiresAt?: string | null;
      };
      // provider 가 회신한 만료를 미러링한다 — 우리는 기한을 정하지 않고(템플릿의
      // deadline_days 또는 임베드에서 PG 가 정한 값) 표시용으로만 따라간다. 시각
      // 비교는 값 기준(포맷 차이로 매 폴마다 같은 값을 다시 쓰는 churn 방지).
      // **부재는 지움이다** — email_delivery(생략=이력 유지)와 반대인 의도적 비대칭:
      // 마감의 부재는 '마감 없음'이라는 의미를 가지므로, provider 가 마감을 해제하면
      // 카드가 지나간 마감을 계속 주장하지 않게 지운다.
      if (
        detail.expiresAt &&
        (!contract.expiresAt ||
          new Date(detail.expiresAt).getTime() !== new Date(contract.expiresAt).getTime())
      ) {
        patch.expiresAt = detail.expiresAt;
      } else if (!detail.expiresAt && contract.expiresAt) {
        patch.expiresAt = null;
      }
      // 비종결(in_progress) 전이만 여기서 패치한다. 종결(completed/declined/expired)은
      // 아래에서 원자 CAS(finalizeIfNotFinal / transitionIfActive)로 처리해 동시 폴링·웹훅
      // 중복 완료/알림을 막는다.
      // 운영자 디스코드 알림은 이 분기에 걸지 않는다 — 스냅샷 비교(CAS 아님)라 동시
      // reconcile 이 이중발화한다. 종결 계열과 달리 원자 가드가 없어 v1 제외(후속 과제).
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
      if (transitioned) {
        await this.notifyTerminal(contract.rfpId, nextStatus, contract.round, { contractId });
      }
    }
    if (nextStatus === 'canceled') {
      // 제공자 측 외부 취소(SnowSign 콘솔 등)를 로컬에도 반영해 폴링을 멈춘다. 앱 자체
      // 취소(cancel())는 별도로 당사자 알림을 보내므로 여기선 상태 전이만 하고,
      // 실제 전이한 호출자만 운영자 채널에 알린다(CAS 멱등 — 중복 폴 무발화).
      const transitioned = await this.signingRepo.transitionIfActive(
        contractId,
        'canceled',
        new Date(),
        { cancelReason: '제공자 측 취소' },
      );
      if (transitioned) {
        const rfp = await this.rfpRepo.findById(contract.rfpId);
        if (rfp) {
          // 앱 내 cancel() 과 **다른 action** — 같은 action 을 쓰면 활동 기록이
          // '아무개가 취소했어요'로 읽힌다(실제로는 스노우싸인 콘솔 취소). actor 는
          // 스키마상 필수라 rfp 담당자를 기록 앵커로 쓰되, 라벨이 사건형 문구로
          // 사람의 행위 주장을 피한다. best-effort: 전이 CAS 는 이미 커밋됐고,
          // 여기서 던지면 운영자 알림까지 건너뛰는데 재폴은 transitioned=false 라
          // 다시 발화하지 않는다.
          await this.auditBestEffort(
            {
              actorUserId: rfp.createdBy,
              actorWorkspaceId: rfp.buyerWsId,
              action: 'signing.canceled_by_provider',
              entityType: 'rfp',
              entityId: rfp.code,
              metadata: { contractId, reason: '제공자 측 취소' },
            },
            'signing.provider_cancel_audit_failed',
          );
          notifySigningOperator({
            event: 'canceled',
            rfpCode: rfp.code,
            rfpTitle: rfp.title,
            round: contract.round,
          });
        }
      }
    }
    return { ok: true };
  }

  /** 멱등 완료 진입점 — 실제 전이한 경우에만 감사·알림. 중복 폴링 안전. */
  async ensureFinalized(contractId: string): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
    // 운영자 알림 페이로드는 tx 안(transitioned 분기)에서 캡처해 커밋 후에만 발화한다 —
    // pendingEmits 와 같은 롤백 안전성(롤백되면 미발송).
    let operatorNotice: SigningOperatorNotice | undefined;
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
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: await this.bothPartyRecipients(rfp, pgWsId, tx),
            channels: ['inapp'],
            type: 'signing.completed',
            title: `[${rfp.code}] 서명 완료`,
            body: '모든 서명이 완료됐어요.',
            linkUrl: (rcpt) => this.partyLink(rcpt, rfp),
          })),
        );
        operatorNotice = {
          event: 'completed',
          rfpCode: rfp.code,
          rfpTitle: rfp.title,
          round: found.contract.round,
        };
      }
    });
    emitAfterCommit(pendingEmits);
    if (operatorNotice) notifySigningOperator(operatorNotice);
    return { ok: true };
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
        logger.error('signing.sweep_row_threw', { rfpId: o.rfpId, err: String(e) });
        continue;
      }
      if (r.ok) {
        created += 1;
        logger.warn('signing.sweep_recreated_missing_contract', { rfpId: o.rfpId });
        captureSigningError(
          'signing.sweep_recreated_missing_contract',
          new Error('onAward was lost and recreated by sweep'),
          { rfpId: o.rfpId },
        );
      } else {
        logger.error('signing.sweep_failed', { rfpId: o.rfpId, error: r.error });
      }
    }
    return { ok: true, created };
  }

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
   * 오래 방치된 awaiting_pg_template 계약의 PG 에게 계약서 발송을 재넛지한다. 기본
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
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: pgMembers.map((m) => ({
              userId: m.userId,
              workspaceId: bid.pgWsId,
              email: m.email,
            })),
            channels: ['inapp'],
            type: 'signing.awaiting_template',
            title: `[${rfp.code}] 계약서를 확인하고 보내 주세요`,
            // 고아(발송은 됐는데 완료 신호가 유실된 경우)에게 "아직 안 보냈다"고
            // 하면 거짓말이 된다 — 그 사람은 이미 보냈다. 양쪽 다 담는다.
            body: "딜룸에서 계약서를 올려 보내 주세요. 이미 보냈다면 딜룸의 '보낸 계약서 찾기'로 연결할 수 있어요.",
            linkUrl: `/inbox/${rfp.code}`,
          })),
        );
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

  private async persistAwaiting(
    contractId: string,
    rfp: RFP,
    pgWsId: string,
    actor: Actor,
    round: number,
  ): Promise<ServiceResult> {
    const pendingEmits: Notification[] = [];
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
          channels: ['inapp'],
          type: 'signing.awaiting_template',
          title: `[${rfp.code}] 계약서를 확인하고 보내 주세요`,
          body: '견적이 선정됐어요. 딜룸에서 계약서를 올리고 전자서명을 시작해 주세요.',
          linkUrl: `/inbox/${rfp.code}`,
        })),
      );
      return { ok: true as const };
    });
    if (result.ok) {
      emitAfterCommit(pendingEmits);
      notifySigningOperator({
        event: 'awaiting_created',
        rfpCode: rfp.code,
        rfpTitle: rfp.title,
        round,
      });
    }
    return result;
  }

  private async notifyTerminal(
    rfpId: string,
    status: 'declined' | 'expired',
    round: number | undefined,
    // 감사 로그용 — 전이는 시스템(폴링/웹훅)이 발견하므로 사람 actor 가 없고,
    // 기록 앵커는 아래에서 rfp 담당자로 잡는다.
    auditRef: { contractId: string },
  ): Promise<void> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return;
    const pgWsId = rfp.awardedBidId
      ? (await this.bidRepo.findById(rfp.awardedBidId))?.pgWsId
      : undefined;
    // CAS(transitionIfActive)에 이긴 호출자만 여기 도달하므로 정확히 1회 기록된다
    // (거절/만료도 계약 이력의 일부다). **알림 tx 밖**이다 — ensureFinalized 와 달리
    // 이 경로의 CAS 는 tx 밖에서 이미 커밋됐으므로, 감사 실패를 tx 에 묶으면 전이는
    // 남고 양측 알림만 롤백돼 영구 유실된다(재폴은 transitioned=false 라 재발화 없음).
    // actor 앵커는 rfp 담당자다 — 계약 개설자(contract.createdBy)는 PG 가 재발송으로
    // 연 라운드에서 PG 직원이라, 구매사 활동 기록에 상대사 이름이 행위자로 찍힌다.
    // 라벨은 사건형 문구('~됐어요')라 사람의 행위를 주장하지 않는다.
    await this.auditBestEffort(
      {
        actorUserId: rfp.createdBy,
        actorWorkspaceId: rfp.buyerWsId,
        action: `signing.${status}`,
        entityType: 'rfp',
        entityId: rfp.code,
        metadata: { contractId: auditRef.contractId },
      },
      'signing.terminal_audit_failed',
    );
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: await this.bothPartyRecipients(rfp, pgWsId, tx),
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
          linkUrl: (rcpt) => this.partyLink(rcpt, rfp),
        })),
      );
    });
    emitAfterCommit(pendingEmits);
    notifySigningOperator({ event: status, rfpCode: rfp.code, rfpTitle: rfp.title, round });
  }

  private async resolvePartyByRfp(rfp: RFP, actor: Actor): Promise<Party | null> {
    if (rfp.buyerWsId === actor.workspaceId) return 'buyer';
    if (rfp.awardedBidId) {
      const bid = await this.bidRepo.findById(rfp.awardedBidId);
      if (bid?.pgWsId === actor.workspaceId) return 'pg';
    }
    return null;
  }

  /**
   * 수신자 워크스페이스에 맞는 딜룸 딥링크. `/rfp/…` 는 buyer 전용 게이트
   * (requireBuyerPage)라 PG 가 누르면 /home 으로 튕긴다 — 같은 서비스의 takeover·
   * awaiting 넛지는 이미 `/inbox/…` 를 쓰는데 종결·발송 계열 5곳만 buyer 링크
   * 하나로 나가고 있었다.
   */
  // `workspaceId: string | null` 을 받는 이유: notify 의 linkUrl 콜백이 넘겨주는
  // NotifyRecipient 는 workspaceId 가 nullable 이다. 여기서는 buyerWsId 와의
  // 일치 여부만 보므로 null 은 자연히 PG 쪽(`/inbox`)으로 떨어져 기존과 같다.
  private partyLink(rcpt: { workspaceId: string | null }, rfp: RFP): string {
    return rcpt.workspaceId === rfp.buyerWsId ? `/rfp/${rfp.code}` : `/inbox/${rfp.code}`;
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
        getRfpRepo,
        getBidRepo,
        getUserRepo,
        getWorkspaceRepo,
        getAuditLogRepo,
        getPgSigningTemplateRepo,
      },
      { getSnowSignClient },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
      import('@/lib/server/signing/snowsign-client'),
    ]);
    const [signingRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo, templateRepo] =
      await Promise.all([
        getSigningContractRepo(),
        getRfpRepo(),
        getBidRepo(),
        getUserRepo(),
        getWorkspaceRepo(),
        getAuditLogRepo(),
        getPgSigningTemplateRepo(),
      ]);
    globalThis.__bidit_contract_signing_service__ = new ContractSigningService(
      db,
      signingRepo,
      rfpRepo,
      bidRepo,
      userRepo,
      wsRepo,
      auditRepo,
      getSnowSignClient(),
      templateRepo,
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
