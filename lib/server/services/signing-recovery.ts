import type { AgreementDraftLookupRepo } from '@/lib/server/repositories/types';
import { requiresCommonAgreement } from '@/lib/server/signing/agreement-boundary';
import type {
  BidRepo,
  RfpRepo,
  SigningContractRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { logger } from '@/lib/observability/logger';
import {
  SnowSignError,
  type SnowSignClient,
  type SnowSignContractSummary,
} from '@/lib/server/signing/snowsign-client';
import type { SigningContract, SigningRecoveryCandidate } from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';
import { SigningSendLease } from './signing-send-lease';
import {
  participantsMatchDeal,
  isDispatchedProviderStatus,
  mapProviderContractStatus,
  resolveSigningParty,
} from './signing-policy';

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

/** 선정보다 먼저 만들어진 계약일 수 없다. 시계 오차 여유. */
const RECOVERY_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * 복구 스캔이 후보로 **보여줄 수 있는** 상태. dispatched(발송됨)에 더해 `completed`
 * 를 포함한다 — 다만 바인딩 수락은 이것만으로 결정되지 않는다. 완료 계약은 서버가
 * 기록한 노출 사실(`isRefDisclosed`)이 있을 때만 붙일 수 있다(아래 attach 게이트).
 */
function isRecoverableProviderStatus(s: string): boolean {
  return isDispatchedProviderStatus(s) || mapProviderContractStatus(s) === 'completed';
}
/** 낙찰 PG의 복구 후보 조회를 소유한다. ACL·발송 리스·조회 예산·참여자 매칭·노출 기록을 한 경로에서 적용한다. */
export class SigningRecovery {
  constructor(
    private readonly deps: {
      signingRepo: SigningContractRepo;
      rfpRepo: RfpRepo;
      bidRepo: BidRepo;
      userRepo: UserRepo;
      workspaceRepo: WorkspaceRepo;
      snowsign: SnowSignClient;
      agreementRepo: AgreementDraftLookupRepo;
      sendLease: SigningSendLease;
    },
  ) {}

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
  ): Promise<
    ServiceResult<{
      candidates: SigningRecoveryCandidate[];
      truncated: boolean;
    }>
  > {
    const rfp = await this.deps.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 이 먼저다 — 존재 오라클도, 남의 딜로 예산을 태우는 것도 막는다.
    if ((await resolveSigningParty(this.deps.bidRepo, rfp, actor)) !== 'pg')
      return { ok: false, error: 'FORBIDDEN' };
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };
    const bid = await this.deps.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    const active = await this.deps.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const buyerSigner = await this.deps.userRepo.findContactById(rfp.createdBy);
    const buyerEmail = buyerSigner?.email.toLowerCase();
    const pgEmails = new Set(
      (await this.deps.workspaceRepo.approvedMemberRecipients(bid.pgWsId)).map((m) =>
        m.email.toLowerCase(),
      ),
    );
    if (!buyerEmail || pgEmails.size === 0) {
      logger.info('signing.recover_abstained', {
        contractId: active.id,
        reason: 'no_emails',
      });
      return { ok: true, candidates: [], truncated: false };
    }

    if (await requiresCommonAgreement(active, this.deps.agreementRepo))
      return { ok: false, error: 'AGREEMENT_REQUIRED' };
    // **이 경로는 절대 뺏지 않는다.** 스캔은 읽기인데 강제 취득은 동료의 임베드를
    // 닫고 그 사람이 올리던 PDF·서명칸을 없앤다 — 목록만 보려던 클릭이 남의 작업을
    // 죽이면 안 된다. 파괴적 조작의 진입점은 임베드('계약서 올리기') 하나로 모은다.
    // 리스는 여전히 잡는다(작성 중인 담당자와 상호배타) — 다만 비어 있을 때만.
    const now = new Date();
    const claimed = (
      await this.deps.sendLease.claim({
        contractId: active.id,
        holderUserId: actor.userId,
        now,
      })
    ).ok;
    if (!claimed) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SIGNING_RECOVERY_DEADLINE_MS);
    try {
      return await this.scanRecoveryCandidates(active, buyerEmail, pgEmails, ac.signal);
    } catch (e) {
      logger.warn('signing.recover_scan_failed', {
        contractId: active.id,
        err: String(e),
      });
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
      };
    } finally {
      clearTimeout(timer);
      // 리스는 무조건 돌려준다 — 안 그러면 실패 한 번이 5분을 잠근다.
      await this.deps.sendLease.release({
        contractId: active.id,
        claimedAt: now,
        surface: 'recovery',
      });
    }
  }

  private async scanRecoveryCandidates(
    active: SigningContract,
    buyerEmail: string,
    pgEmails: ReadonlySet<string>,
    signal: AbortSignal,
  ): Promise<
    ServiceResult<{
      candidates: SigningRecoveryCandidate[];
      truncated: boolean;
    }>
  > {
    // 정렬 순서가 문서에 없다 — 오래된 순이면 1페이지가 쓸모없다. 페이지가 여러 장이면
    // 마지막 장도 받아 어느 쪽 끝에 최신이 있든 확보하고, 받은 뒤 직접 정렬한다.
    let truncated = false;
    const seen = new Map<string, SnowSignContractSummary>();
    for (const status of RECOVERY_SCAN_STATUSES) {
      const first = await this.deps.snowsign.listContracts({
        status,
        perPage: 100,
        page: 1,
        signal,
        maxRetries: 1,
      });
      for (const r of first.rows) seen.set(r.contractId, r);
      if (first.totalPages > 1) {
        truncated = true;
        const last = await this.deps.snowsign.listContracts({
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
      : await this.deps.signingRepo.findBoundProviderRefs(dated.map((r) => r.contractId));
    const pool = dated.filter((row) => !bound.has(row.contractId));
    pool.sort((a, b) =>
      (b.sentAt ?? b.createdAt ?? '').localeCompare(a.sentAt ?? a.createdAt ?? ''),
    );
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
            return {
              row,
              detail: await this.deps.snowsign.getContract(row.contractId, {
                signal,
                maxRetries: 1,
              }),
            };
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
    await this.deps.signingRepo.recordRecoveryDisclosure(
      active.id,
      candidates.map((c) => c.providerContractId),
    );
    return { ok: true, candidates, truncated };
  }
}
