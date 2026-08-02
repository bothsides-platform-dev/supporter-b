import { randomUUID } from 'node:crypto';

import type {
  AuditLogRepo,
  BidRepo,
  RfpRepo,
  SigningContractRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify } from '@/lib/server/notifications/notify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { logger } from '@/lib/observability/logger';
import { appOrigins } from '@/lib/site-routing';
import { EMBED_SEND_LEASE_MS } from '@/lib/signing/embed-lease';
import {
  SnowSignError,
  type SnowSignClient,
  type SnowSignContractSummary,
} from '@/lib/server/signing/snowsign-client';
import { captureSigningError } from '@/lib/server/signing/observability';
import type { RFP } from '@/lib/types/rfp';
import type { Notification } from '@/lib/types/notification';
import type {
  SigningContract,
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantStatus,
  SigningRecoveryCandidate,
} from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';

export type { Actor, ServiceResult };

const TERMINAL = new Set<SigningContractStatus>(['completed', 'declined', 'expired', 'canceled']);

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
 * `snowsignTemplateId` 는 템플릿 시절의 이력 컬럼이라 신규 발송에는 채워지지 않지만,
 * 남아 있는 옛 행에서는 여전히 PG 가 어떤 계약서를 썼는지 드러내므로 함께 벗긴다.
 * 어느 구매사 화면도 두 값을 읽지 않는다. 경계 소유자는 **이 서비스** 한 곳이다 —
 * 로더가 따로 벗기면 새 호출자가 생길 때 조용히 빠진다.
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
 * 상세 조회 상한. 목록 ≤4 + 상세 12 = **클릭 한 번에 최대 16회**.
 * 스노우싸인 rate limit 은 분당 100회이고 그 키를 모든 PG사·모든 서명 기능이
 * 공유한다(되돌린 cron 설계는 틱당 1010회였다).
 */
export const RECOVERY_MAX_DETAIL_LOOKUPS = 12;

/** 동시 상세 조회 수. 3웨이브 × ~1초면 데드라인 안에 들어온다. */
const RECOVERY_DETAIL_CONCURRENCY = 4;

/** 훑을 provider 상태 — `in_progress` 를 빼면 구매사가 먼저 서명한 고아를 놓친다. */
const RECOVERY_SCAN_STATUSES = ['pending', 'in_progress'] as const;

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
    private readonly rfpRepo: RfpRepo,
    private readonly bidRepo: BidRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly snowsign: SnowSignClient,
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
      return parked.ok ? { ok: true, degraded: true } : parked;
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
  ): Promise<ServiceResult<{ iframeUrl: string; sessionId: string; claimedAt: string }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 먼저(fail-closed) — 존재 여부를 노출하기 전에 당사자인지 본다.
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    // 파트너 오리진은 `appOrigins()` 로만 읽는다 — env 를 직접 읽으면 한쪽만 설정된
    // 깨진 배포에서 던져야 할 가드(both-or-neither)를 건너뛰고, 하드코딩 폴백이
    // 그 사실을 조용히 덮는다. 임베드가 postMessage 를 보낼 오리진이라 특히 그렇다.
    //
    // **리스보다 먼저** 해석한다. 이건 순수 설정 조회라 실패하면 무조건 실패고,
    // 리스를 잡은 뒤에 던지면 세션도 못 만든 채 리스만 남아 PG 가 5분간 잠긴다
    // (아래 try 의 보상 반납은 SnowSign 호출만 감싼다).
    const origin = appOrigins().pg;

    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - EMBED_SEND_LEASE_MS),
    );
    if (!claimed) return { ok: false, error: 'CONTRACT_BUSY' };

    try {
      const s = await this.snowsign.createEmbedSession({
        purpose: 'contract_create',
        allowedOrigins: [origin],
        flows: ['pdf_send'],
        externalSystem: 'supporter-b',
        // 이 계약을 가리키는 소유 증표. 스노우싸인이 이 값을 계약에 실어 돌려주면
        // attachProviderContract 가 서버측 소유 검증을 할 수 있다(SNOWSIGN_SANDBOX Q3).
        externalId: embedExternalId(active.id),
        referenceId: `sc:${active.id}`,
      });
      // claimedAt 을 함께 돌려준다 — 화면이 임베드를 닫을 때 이 값으로 리스를 반납한다
      // (`releaseSendEmbedClaim`). 값이 틀리면 repo 의 정확일치 가드가 no-op 으로 삼킨다.
      return { ok: true, iframeUrl: s.iframeUrl, sessionId: s.sessionId, claimedAt: now.toISOString() };
    } catch (e) {
      // 세션도 못 받았는데 리스가 남으면 다음 시도가 리스 만료까지 막힌다.
      try {
        await this.signingRepo.releaseSendClaim(active.id, now);
      } catch (re) {
        logger.warn('signing.release_claim_failed', { contractId: active.id, err: String(re) });
      }
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
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
    if (!renewed) return { ok: false, error: 'CONTRACT_BUSY' };
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
      /** 감사 메타데이터 — 복구로 붙인 것과 임베드가 알린 것을 운영에서 구분한다. */
      source?: 'embed' | 'recovery';
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
    // 멱등 — 복구와 postMessage 가 겹쳐 두 번 도착할 수 있다.
    if (active.providerRef === providerContractId) return { ok: true };
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
    if (!isDispatchedProviderStatus(detail.status)) {
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

    const buyerSigner = await this.userRepo.findContactById(rfp.createdBy);
    const pgSigner = await this.userRepo.findContactById(bid.submittedBy);
    const buyerEmail = buyerSigner?.email.toLowerCase();
    const pgEmail = pgSigner?.email.toLowerCase();

    const now = new Date();
    const participants: SigningParticipant[] = detail.participants.map((p) => {
      const email = p.email.toLowerCase();
      // 구매사 담당과 일치하는 사람만 buyer 로 본다. 나머지는 PG 가 자기 쪽에 추가한
      // 사람으로 취급한다 — 구매사 오타는 아래 participantMismatch 가 잡는다.
      const isBuyer = !!buyerEmail && email === buyerEmail;
      return {
        id: randomUUID(),
        contractId: active.id,
        userId: isBuyer ? rfp.createdBy : email === pgEmail ? bid.submittedBy : undefined,
        name: p.name,
        email: p.email,
        phone: p.phone,
        role: isBuyer ? ('buyer' as const) : ('pg' as const),
        securityMethod: p.securityMethod === 'identity_verification' ? 'easy_cert' : 'email',
        status: mapProviderParticipantStatus(p.status) ?? 'pending',
        signedAt: p.signedAt,
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
          { providerRef: providerContractId, sentAt: now.toISOString() },
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
              source: opts?.source ?? 'embed',
            },
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
    return { ok: true, participantMismatch };
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

    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - EMBED_SEND_LEASE_MS),
    );
    if (!claimed) return { ok: false, error: 'SEND_IN_PROGRESS' };

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
      const first = await this.snowsign.listContracts({ status, perPage: 100, page: 1, signal });
      for (const r of first.rows) seen.set(r.contractId, r);
      if (first.totalPages > 1) {
        truncated = true;
        const last = await this.snowsign.listContracts({
          status,
          perPage: 100,
          page: first.totalPages,
          signal,
        });
        for (const r of last.rows) seen.set(r.contractId, r);
      }
    }

    const floor = new Date(active.createdAt).getTime() - RECOVERY_CLOCK_SKEW_MS;
    const pool: SnowSignContractSummary[] = [];
    for (const row of seen.values()) {
      // 선정보다 먼저 만들어진 계약일 수 없다(목록이 created_at 을 줄 때만 판정 가능).
      if (row.createdAt && new Date(row.createdAt).getTime() < floor) continue;
      // 이미 다른 계약 행이 쥔 것은 후보가 아니다.
      if (await this.signingRepo.findByProviderRef(row.contractId)) continue;
      pool.push(row);
    }
    pool.sort((a, b) => (b.sentAt ?? b.createdAt ?? '').localeCompare(a.sentAt ?? a.createdAt ?? ''));
    if (pool.length > RECOVERY_MAX_DETAIL_LOOKUPS) truncated = true;
    const targets = pool.slice(0, RECOVERY_MAX_DETAIL_LOOKUPS);

    const candidates: SigningRecoveryCandidate[] = [];
    for (let i = 0; i < targets.length; i += RECOVERY_DETAIL_CONCURRENCY) {
      if (signal.aborted) {
        truncated = true;
        break;
      }
      const wave = await Promise.all(
        targets.slice(i, i + RECOVERY_DETAIL_CONCURRENCY).map(async (row) => {
          try {
            return { row, detail: await this.snowsign.getContract(row.contractId, { signal }) };
          } catch {
            return null; // 한 건 실패가 스캔 전체를 무너뜨리지 않는다.
          }
        }),
      );
      for (const hit of wave) {
        if (!hit) continue;
        const { row, detail } = hit;
        if (!isDispatchedProviderStatus(detail.status)) continue;
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
        for (const m of pgMembers) {
          pendingEmits.push(
            ...(await notify(tx, {
              recipients: [{ userId: m.userId, workspaceId: bid.pgWsId, email: m.email }],
              channels: ['inapp'],
              type: 'signing.awaiting_template',
              title: `[${rfp.code}] 계약서를 확인하고 보내 주세요`,
              // 고아(발송은 됐는데 완료 신호가 유실된 경우)에게 "아직 안 보냈다"고
              // 하면 거짓말이 된다 — 그 사람은 이미 보냈다. 양쪽 다 담는다.
              body: "딜룸에서 계약서를 올려 보내 주세요. 이미 보냈다면 딜룸의 '보낸 계약서 찾기'로 연결할 수 있어요.",
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
      for (const m of pgMembers) {
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [{ userId: m.userId, workspaceId: pgWsId, email: m.email }],
            channels: ['inapp'],
            type: 'signing.awaiting_template',
            title: `[${rfp.code}] 계약서를 확인하고 보내 주세요`,
            body: '견적이 선정됐어요. 딜룸에서 계약서를 올리고 전자서명을 시작해 주세요.',
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
    const [signingRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo] =
      await Promise.all([
        getSigningContractRepo(),
        getRfpRepo(),
        getBidRepo(),
        getUserRepo(),
        getWorkspaceRepo(),
        getAuditLogRepo(),
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
