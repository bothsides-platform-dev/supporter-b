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

/**
 * 발송 클레임 리스. 프로세스가 발송 도중 죽어도 이 시간이 지나면 다시 누를 수 있다.
 *
 * 정상 발송 중에 두 번째 클릭이 통과하면 안 되므로 클라이언트의 **최악** 왕복보다
 * 길어야 한다: `performSend` 는 요청을 둘(create + send) 보내고 각각 15초 타임아웃 +
 * 최대 3회 재시도(429/5xx) + 지수 백오프라 요청당 ~61초, 합 ~123초다. 2분은 그보다
 * 짧아서 SnowSign 장애 중에 리스가 먼저 만료된다 — 5분으로 둔다.
 * (`markSentIfAwaiting` CAS 가 sent 행은 하나로 막지만, 그 전에 서명요청 메일이 두 번
 *  나가는 것까지는 못 막는다.)
 */
const SEND_LEASE_MS = 5 * 60_000;

/**
 * 임베드 발송 클레임 리스. `SEND_LEASE_MS` 와 달리 이건 **사람의 작업 시간**을 덮어야
 * 한다 — PG 가 iframe 안에서 PDF 를 올리고 서명칸을 배치하고 참여자를 입력하는 데
 * 걸리는 시간이다. 5분은 짧아서 작업 중에 리스가 풀리고, 그러면 다른 담당자가 두 번째
 * 임베드를 열어 계약이 두 건 발송된다. 30분으로 둔다.
 *
 * 대가: 임베드를 열어놓고 이탈하면 다른 담당자가 최대 30분 기다린다. 상태를 바꾸지는
 * 않으므로 계약은 awaiting 에 그대로 남고, 리스가 풀리면 아무나 다시 열 수 있다.
 */
const EMBED_SEND_LEASE_MS = 30 * 60_000;

/**
 * SnowSign 왕복 도중 계약이 awaiting 을 벗어났다(구매사 취소·웹훅 종결 등).
 * 트랜잭션을 되감아 위쪽 보상 취소 경로를 타게 하는 신호용 sentinel.
 */
/**
 * 구매사에게 나갈 계약 행에서 provider 측 식별자를 벗긴다.
 *
 * `snowsignTemplateId` 는 PG 가 **어떤 계약서를 골랐는지** 식별한다 — 예전엔 PG 당 기본
 * 하나뿐이라 무의미했지만 견적별 선택이 생긴 지금은 같은 PG 가 건마다 다른 계약서를
 * 쓴다는 사실이 드러난다(봉인 경계). `providerRef`(SnowSign 계약 id)도 같이 벗긴다.
 * 어느 구매사 화면도 두 값을 읽지 않는다. 경계 소유자는 **이 서비스** 한 곳이다 —
 * 로더가 따로 벗기면 새 호출자가 생길 때 조용히 빠진다.
 */
export function stripProviderRefs(contract: SigningContract): SigningContract {
  const { snowsignTemplateId: _t, providerRef: _p, ...rest } = contract;
  return rest;
}

class ContractNoLongerAwaitingError extends Error {
  constructor() {
    super('contract left awaiting during send');
    this.name = 'ContractNoLongerAwaitingError';
  }
}

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
   * award 커밋 후 호출(action 오케스트레이션). **항상** awaiting_pg_template 로 기록하고
   * PG 에게 발송을 요청한다 — 자동 발송은 없다. 어떤 계약서를 보낼지는 견적별로 다르고,
   * PG 가 딜룸에서 확인한 뒤 `sendContract` 로 보낸다. 견적에 미리 골라둔 템플릿이 있어도
   * 마찬가지다(그 값은 딜룸 픽커의 기본 선택으로만 쓰인다).
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

  /**
   * PG 가 딜룸에서 계약서를 고르고 발송한다 — 유일한 명시적 발송 경로.
   * 낙찰 PG 만 호출할 수 있고(구매사는 남의 계약서를 고를 수 없다), 템플릿은 그 PG
   * 소유여야 한다. 동시 발송은 `claimForSend` CAS 로 직렬화해 SnowSign 계약이 두 건
   * 만들어지는 것을 막는다. 발송에 실패하면 클레임을 풀고 계약은 awaiting 에 남아
   * 카드가 계속 눌린다.
   */
  async sendContract(rfpId: string, templateId: string, actor: Actor): Promise<ServiceResult> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 먼저(fail-closed). 낙찰 PG 판정은 `rfp.awardedBidId` 를 거치므로, 카드가 열려
    // 있는 동안 선정이 철회되면 여기서 FORBIDDEN 으로 걸린다(존재 오라클도 안 만든다).
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };
    // 아래 non-null 가드는 **TS narrowing 전용** — 위 party 검사가 이미 awardedBidId 非null
    // 을 함의하므로 런타임에는 도달하지 않는다.
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };

    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    // 스코프 기준은 세션이 아니라 낙찰 bid 의 소유 워크스페이스 — 위 party 검사로 둘이
    // 같음이 이미 증명됐고, 이렇게 두면 세션 드리프트가 경계를 넓힐 수 없다.
    const template = await this.templateRepo.findByIdScoped(templateId, bid.pgWsId);
    if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - SEND_LEASE_MS),
    );
    if (!claimed) return { ok: false, error: 'CONTRACT_BUSY' };

    const sent = await this.performSend(rfp, bid, template, actor, {
      contractId: active.id,
      mode: 'update',
      round: active.round,
      createdBy: active.createdBy,
    });
    if (!sent.ok) {
      // 리스 만료를 기다리지 않고 바로 다시 누를 수 있게 한다(best-effort).
      try {
        await this.signingRepo.releaseSendClaim(active.id, now);
      } catch (e) {
        logger.warn('signing.release_claim_failed', { contractId: active.id, err: String(e) });
      }
    }
    return sent;
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
   * 재발송 — ACL(양측). 활성 계약을 취소하고 새 라운드를 연다.
   *
   * 계약서는 **직전에 실제로 쓴 것**을 그대로 재사용한다(구매사도 이 버튼을 누르는데,
   * 구매사는 PG 계약서를 고를 수 없으므로 재선택을 요구할 수 없다). 그 템플릿이 그새
   * 삭제됐거나 다른 워크스페이스로 넘어갔으면 에러 대신 새 라운드를 awaiting 으로 열어
   * PG 가 딜룸에서 다시 고르게 한다 — 어느 쪽이 눌러도 dead-end 가 없다.
   */
  async resend(rfpId: string, actor: Actor): Promise<ServiceResult<{ degraded?: boolean }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (!(await this.resolvePartyByRfp(rfp, actor))) return { ok: false, error: 'FORBIDDEN' };
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };
    const template = await this.resolvePreviousTemplate(rfpId, bid.pgWsId);

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
    if (!template) {
      // 보낼 계약서를 특정할 수 없어 대기로 되돌린다 — 아무것도 발송되지 않았으므로
      // 호출자가 '다시 발송했어요' 라고 말하지 않도록 degraded 를 실어 보낸다.
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
    return this.performSend(rfp, bid, template, actor, {
      contractId: randomUUID(),
      mode: 'create',
      round,
      createdBy: actor.userId,
    });
  }

  /**
   * 이 RFP 에서 직전에 실제로 발송에 쓴 PG 계약서 템플릿. `snowsign_template_id` 는 FK 없는
   * 텍스트 사본이라 링크 행이 지워져도 남는다 — 그래서 소유 링크를 되짚어 **현재도 이 PG
   * 소유인지** 확인한다. 지워졌거나 남의 소유면 undefined(호출자가 awaiting 으로 저하).
   */
  private async resolvePreviousTemplate(
    rfpId: string,
    pgWsId: string,
  ): Promise<PgSigningTemplate | undefined> {
    const prior = (await this.signingRepo.findByRfp(rfpId)).find((c) => c.snowsignTemplateId);
    if (!prior?.snowsignTemplateId) return undefined;
    const owner = await this.templateRepo.findBySnowsignTemplateId(prior.snowsignTemplateId);
    return owner && owner.workspaceId === pgWsId ? owner : undefined;
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
  ): Promise<ServiceResult<{ iframeUrl: string; sessionId: string }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    // ACL 먼저(fail-closed) — 존재 여부를 노출하기 전에 당사자인지 본다.
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - EMBED_SEND_LEASE_MS),
    );
    if (!claimed) return { ok: false, error: 'CONTRACT_BUSY' };

    const origin = process.env.NEXT_PUBLIC_PARTNER_ORIGIN ?? 'http://localhost:3000';
    try {
      const s = await this.snowsign.createEmbedSession({
        purpose: 'contract_create',
        allowedOrigins: [origin],
        flows: ['pdf_send'],
        externalSystem: 'supporter-b',
        // 이 계약을 가리키는 소유 증표. 스노우싸인이 이 값을 계약에 실어 돌려주면
        // attachProviderContract 가 서버측 소유 검증을 할 수 있다(SNOWSIGN_SANDBOX Q3).
        externalId: `sc:${active.id}`,
        referenceId: `sc:${active.id}`,
      });
      return { ok: true, iframeUrl: s.iframeUrl, sessionId: s.sessionId };
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
  ): Promise<ServiceResult<{ participantMismatch?: boolean }>> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };
    if (!rfp.awardedBidId) return { ok: false, error: 'NOT_AWARDED' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    // 멱등 — 복구 자동 매칭과 postMessage 가 겹쳐 두 번 도착할 수 있다.
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

    // 소유 검증은 external_id 가 회신될 때만 가능하다. 회신되지 않는 계정이면
    // 위의 ACL + 바인딩 유일성만으로 게이트한다(SNOWSIGN_SANDBOX Q3 참조).
    if (detail.externalId && detail.externalId !== `sc:${active.id}`) {
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
            metadata: { contractId: active.id, providerRef: providerContractId, participantMismatch },
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

  /** PG 워크스페이스에 링크된 계약서 템플릿 목록(org 스코프). */
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
   * SnowSign 템플릿을 PG 워크스페이스에 링크한다(역할/변수 매핑 포함).
   * roleMapping 은 buyer·pg 양측을 모두 포함해야 한다.
   *
   * 링크는 **어떤 계약도 발송하지 않는다** — 발송은 딜룸의 명시적 확인(`sendContract`)뿐이다.
   */
  async linkTemplate(
    actor: Actor,
    input: {
      snowsignTemplateId: string;
      name: string;
      roleMapping: Record<string, Party>;
      variableMapping?: Record<string, string>;
    },
  ): Promise<ServiceResult<{ templateId: string }>> {
    const sides = new Set(Object.values(input.roleMapping));
    if (!sides.has('buyer') || !sides.has('pg')) {
      return { ok: false, error: 'ROLE_MAPPING_INCOMPLETE' };
    }
    // 크로스-테넌트 링크 가드: 다른 워크스페이스가 이미 링크한 SnowSign 템플릿은 거부한다
    // (타 PG 계약서를 자기 것으로 등록해 그 문서로 계약을 생성하는 것 방지).
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
      createdBy: actor.userId,
      createdAt: new Date().toISOString(),
    });
    return { ok: true, templateId };
  }

  /** 템플릿 이름 변경 — 소유 워크스페이스만. 남의 것/없는 것은 구분 없이 TEMPLATE_NOT_FOUND. */
  async renameTemplate(actor: Actor, templateId: string, name: string): Promise<ServiceResult> {
    const renamed = await this.templateRepo.updateName(templateId, actor.workspaceId, name);
    if (!renamed) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    await this.auditRepo.insert({
      actorUserId: actor.userId,
      actorWorkspaceId: actor.workspaceId,
      action: 'signing.template_renamed',
      entityType: 'workspace',
      entityId: actor.workspaceId,
      metadata: { templateId, name },
    });
    return { ok: true };
  }

  /**
   * 템플릿 삭제(하드) — 소유 워크스페이스만. 이미 보낸 계약은 SnowSign 에 살아 있고
   * `signing_contracts.snowsign_template_id` 는 FK 없는 텍스트 사본이라 이력이 남는다.
   * 이 템플릿을 골라둔 견적의 사전 선택은 FK ON DELETE SET NULL 로 풀린다.
   */
  async deleteTemplate(actor: Actor, templateId: string): Promise<ServiceResult> {
    const removed = await this.templateRepo.remove(templateId, actor.workspaceId);
    if (!removed) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    await this.auditRepo.insert({
      actorUserId: actor.userId,
      actorWorkspaceId: actor.workspaceId,
      action: 'signing.template_deleted',
      entityType: 'workspace',
      entityId: actor.workspaceId,
      metadata: { templateId },
    });
    return { ok: true };
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
              body: '아직 계약서를 보내지 않았어요. 딜룸에서 계약서를 고르고 전자서명을 시작해 주세요.',
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
          // 발송 클레임은 SnowSign 왕복 **전**에 잡히므로 send-vs-send 만 직렬화한다.
          // 왕복(수 초) 도중 구매사가 취소하면 이 행은 이미 canceled 다 — 무조건
          // patch 하면 종결된 계약을 sent 로 되살려 취소를 조용히 삼킨다. awaiting
          // 일 때만 전이하는 CAS 로 바꾸고, 지면 아래 catch 가 보상 취소한다.
          const claimed = await this.signingRepo.markSentIfAwaiting(
            opts.contractId,
            {
              providerRef,
              snowsignTemplateId: template.snowsignTemplateId,
              sentAt: now.toISOString(),
            },
            tx,
          );
          if (!claimed) throw new ContractNoLongerAwaitingError();
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
      const lostRace = e instanceof ContractNoLongerAwaitingError;
      // 발송(SnowSign)은 됐으나 로컬 영속이 실패했거나(persist) 그 사이 계약이 종결됐다
      // (race) → 어느 쪽이든 이미 만들어진 계약을 보상 취소해 고아(추적·복구 불가한 라이브
      // 계약 + 재시도 시 새 external_id 로 이중 발송)를 남기지 않는다.
      try {
        await this.snowsign.cancel(providerRef, lostRace ? 'contract canceled mid-send' : 'local persist failed');
      } catch (ce) {
        logger.error('signing.orphan_cancel_failed', { providerRef, err: String(ce) });
        captureSigningError('signing.orphan_cancel_failed', ce, {
          contractId: opts.contractId,
          providerRef,
        });
      }
      if (lostRace) {
        // 경쟁에서 진 것은 버그가 아니다 — 구매사 취소가 이겼을 뿐이라 Sentry 로 올리지 않는다.
        logger.warn('signing.send_lost_race', { contractId: opts.contractId, providerRef });
        return { ok: false, error: 'CONTRACT_CHANGED' };
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
            body: '견적이 선정됐어요. 딜룸에서 보낼 계약서를 고르고 전자서명을 시작해 주세요.',
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
