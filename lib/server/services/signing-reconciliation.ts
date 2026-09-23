import type { AgreementDraftLookupRepo } from '@/lib/server/repositories/types';
import type {
  AuditLogRepo,
  BidRepo,
  RfpRepo,
  SigningContractRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify } from '@/lib/server/notifications/notify';
import {
  notifySigningOperator,
  type SigningOperatorNotice,
} from '@/lib/server/notifications/operator-signing';
import { logger } from '@/lib/observability/logger';
import {
  SnowSignError,
  type SnowSignClient,
  type SnowSignContractDetail,
} from '@/lib/server/signing/snowsign-client';
import { captureSigningError } from '@/lib/server/signing/observability';
import type { RFP } from '@/lib/types/rfp';
import type { Notification } from '@/lib/types/notification';
import type {
  SigningContract,
  SigningContractStatus,
  SigningParticipantPatch,
} from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';
import { mapProviderParticipantStatus, SigningSentCommit } from './signing-sent-commit';
import { signingPartyLink, signingPartyRecipients } from './signing-party-notifications';
import {
  TERMINAL,
  KNOWN_NOOP_PROVIDER_STATUSES,
  mapProviderContractStatus,
  PARTICIPANT_RANK,
  FINAL_PARTICIPANT_STATUSES,
  auditSigningBestEffort,
} from './signing-policy';
import type { Tx } from '@/lib/server/repositories/types';

/** 공급자 상태 동기화와 관측된 계약 바인딩을 소유한다. 완료 CAS·감사·당사자 알림·보관함 연결을 조율한다. */
export class SigningReconciliation {
  constructor(
    private readonly deps: {
      _db: Tx;
      signingRepo: SigningContractRepo;
      rfpRepo: RfpRepo;
      bidRepo: BidRepo;
      workspaceRepo: WorkspaceRepo;
      auditRepo: AuditLogRepo;
      snowsign: SnowSignClient;
      agreementRepo: AgreementDraftLookupRepo;
      sentCommit: SigningSentCommit;
      createArchivePending(contractId: string): Promise<ServiceResult>;
    },
  ) {}

  /**
   * 폴링(딜룸 lazy + cron)으로 SnowSign 상태를 로컬에 반영한다. 참여자 단위 상태를
   * 미러링하고 계약 상태를 전이한다. 완료는 멱등 ensureFinalized 로 위임한다.
   */
  async reconcileStatus(contractId: string): Promise<ServiceResult> {
    const found = await this.deps.signingRepo.findById(contractId);
    if (!found) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    const { contract, participants } = found;
    if (TERMINAL.has(contract.status) || !contract.providerRef) return { ok: true };

    let detail;
    try {
      // 폴링·lazy reconcile 은 다음 틱이 만회한다 — 재시도 예산 1.
      detail = await this.deps.snowsign.getContract(contract.providerRef, {
        maxRetries: 1,
      });
    } catch (e) {
      await this.deps.signingRepo.patchContract(contractId, {
        lastPolledAt: new Date().toISOString(),
      });
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
      logger.warn('signing.unknown_provider_status', {
        contractId,
        status: detail.status,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.deps._db.transaction(async (tx: any) => {
      for (const pp of detail.participants) {
        // 이메일은 대소문자 무시로 매칭 — 제공자가 정규화(소문자화)해 돌려줘도 참여자
        // 상태 미러링이 어긋나지 않도록.
        const local = participants.find((lp) => lp.email.toLowerCase() === pp.email.toLowerCase());
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
          await this.deps.signingRepo.patchParticipant(local.id, partPatch, tx);
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
      // 운영자 슬랙 알림은 이 분기에 걸지 않는다 — 스냅샷 비교(CAS 아님)라 동시
      // reconcile 이 이중발화한다. 종결 계열과 달리 원자 가드가 없어 v1 제외(후속 과제).
      if (nextStatus === 'in_progress' && nextStatus !== contract.status) {
        patch.status = 'in_progress';
      }
      await this.deps.signingRepo.patchContract(contractId, patch, tx);
    });

    if (nextStatus === 'completed') {
      return this.ensureFinalized(contractId);
    }
    if (nextStatus === 'declined' || nextStatus === 'expired') {
      // 활성→종결 원자 전이. 실제로 전이한 호출자만 알림을 보낸다(멱등 — 동시 reconcile
      // 이 stale 스냅샷으로 양쪽 다 알림을 보내던 문제 제거).
      const transitioned = await this.deps.signingRepo.transitionIfActive(
        contractId,
        nextStatus,
        new Date(),
      );
      if (transitioned) {
        await this.notifyTerminal(contract.rfpId, nextStatus, contract.round, {
          contractId,
        });
      }
    }
    if (nextStatus === 'canceled') {
      // 제공자 측 외부 취소(SnowSign 콘솔 등)를 로컬에도 반영해 폴링을 멈춘다. 앱 자체
      // 취소(cancel())는 별도로 당사자 알림을 보내므로 여기선 상태 전이만 하고,
      // 실제 전이한 호출자만 운영자 채널에 알린다(CAS 멱등 — 중복 폴 무발화).
      const transitioned = await this.deps.signingRepo.transitionIfActive(
        contractId,
        'canceled',
        new Date(),
        { cancelReason: '제공자 측 취소' },
      );
      if (transitioned) {
        const rfp = await this.deps.rfpRepo.findById(contract.rfpId);
        if (rfp) {
          // 앱 내 cancel() 과 **다른 action** — 같은 action 을 쓰면 활동 기록이
          // '아무개가 취소했어요'로 읽힌다(실제로는 스노우싸인 콘솔 취소). actor 는
          // 스키마상 필수라 rfp 담당자를 기록 앵커로 쓰되, 라벨이 사건형 문구로
          // 사람의 행위 주장을 피한다. best-effort: 전이 CAS 는 이미 커밋됐고,
          // 여기서 던지면 운영자 알림까지 건너뛰는데 재폴은 transitioned=false 라
          // 다시 발화하지 않는다.
          await auditSigningBestEffort(
            this.deps.auditRepo,
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
          void notifySigningOperator({
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
    let finalized = false; // CAS 승자만 true — 보관함 훅은 실제 전이한 호출에서만 발화한다.
    // CAS 를 감사·알림과 같은 tx 로 묶는다 — 알림/감사 영속이 실패하면 completed 전이도
    // 함께 롤백돼 다음 폴링이 깨끗이 재시도한다(완료 알림 영구 유실 방지). 동시 완료 이중
    // 알림은 finalizeIfNotFinal 의 `WHERE status NOT IN (terminal) RETURNING` 행-락 재평가로
    // 여전히 한 tx 만 통과한다(멱등 보존).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.deps._db.transaction(async (tx: any) => {
      const transitioned = await this.deps.signingRepo.finalizeIfNotFinal(
        contractId,
        new Date(),
        tx,
      );
      if (!transitioned) return;
      finalized = true;
      const found = await this.deps.signingRepo.findById(contractId, tx);
      if (!found) return;
      // tx 안 조회는 반드시 tx 를 전달한다(PGlite 단일 커넥션 데드락 방지).
      const rfp = await this.deps.rfpRepo.findById(found.contract.rfpId, tx);
      await this.deps.auditRepo.insert(
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
          ? (await this.deps.bidRepo.findById(rfp.awardedBidId, tx))?.pgWsId
          : undefined;
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: await signingPartyRecipients(this.deps.workspaceRepo, rfp, pgWsId, tx),
            channels: ['inapp'],
            type: 'signing.completed',
            title: `[${rfp.code}] 서명 완료`,
            body: '모든 서명이 완료됐어요.',
            linkUrl: (rcpt) => signingPartyLink(rcpt, rfp),
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
    if (operatorNotice) void notifySigningOperator(operatorNotice);
    // 완료본 보관함 pending 행 생성은 best-effort(실패는 cron 백필이 만회).
    // 공급자·스토리지의 지연 초기화는 조립 지점에서 주입한 콜백이 소유한다.
    if (finalized) {
      try {
        const r = await this.deps.createArchivePending(contractId);
        if (!r.ok) {
          logger.warn('signing.archive_pending_create_skipped', {
            contractId,
            error: r.error,
          });
        }
      } catch (e) {
        logger.warn('signing.archive_pending_create_failed', {
          contractId,
          err: String(e),
        });
      }
    }
    return { ok: true };
  }

  private async notifyTerminal(
    rfpId: string,
    status: 'declined' | 'expired',
    round: number | undefined,
    // 감사 로그용 — 전이는 시스템(폴링/웹훅)이 발견하므로 사람 actor 가 없고,
    // 기록 앵커는 아래에서 rfp 담당자로 잡는다.
    auditRef: { contractId: string },
  ): Promise<void> {
    const rfp = await this.deps.rfpRepo.findById(rfpId);
    if (!rfp) return;
    const pgWsId = rfp.awardedBidId
      ? (await this.deps.bidRepo.findById(rfp.awardedBidId))?.pgWsId
      : undefined;
    // CAS(transitionIfActive)에 이긴 호출자만 여기 도달하므로 정확히 1회 기록된다
    // (거절/만료도 계약 이력의 일부다). **알림 tx 밖**이다 — ensureFinalized 와 달리
    // 이 경로의 CAS 는 tx 밖에서 이미 커밋됐으므로, 감사 실패를 tx 에 묶으면 전이는
    // 남고 양측 알림만 롤백돼 영구 유실된다(재폴은 transitioned=false 라 재발화 없음).
    // actor 앵커는 rfp 담당자다 — 계약 개설자(contract.createdBy)는 PG 가 재발송으로
    // 연 라운드에서 PG 직원이라, 구매사 활동 기록에 상대사 이름이 행위자로 찍힌다.
    // 라벨은 사건형 문구('~됐어요')라 사람의 행위를 주장하지 않는다.
    await auditSigningBestEffort(
      this.deps.auditRepo,
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
    await this.deps._db.transaction(async (tx: any) => {
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: await signingPartyRecipients(this.deps.workspaceRepo, rfp, pgWsId, tx),
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
          linkUrl: (rcpt) => signingPartyLink(rcpt, rfp),
        })),
      );
    });
    emitAfterCommit(pendingEmits);
    void notifySigningOperator({
      event: status,
      rfpCode: rfp.code,
      rfpTitle: rfp.title,
      round,
    });
  }

  async pollPending(limit: number): Promise<{ polled: number }> {
    const pending = await this.deps.signingRepo.findPollable(limit);
    let polled = 0;
    for (const c of pending) {
      try {
        await this.reconcileStatus(c.id);
      } catch (e) {
        // 한 계약의 예기치 않은 throw(비정상값이 tx 안에서 TypeError 등)가 배치 전체를
        // 무너뜨리지 않도록 격리한다. lastPolledAt 를 전진시켜(findPollable = asc nulls
        // first) 실패한 계약이 큐 선두에 고착(starvation)돼 나머지를 굶기지 않게 한다.
        logger.error('signing.poll_item_failed', {
          contractId: c.id,
          err: String(e),
        });
        try {
          await this.deps.signingRepo.patchContract(c.id, {
            lastPolledAt: new Date().toISOString(),
          });
        } catch (pe) {
          logger.error('signing.poll_mark_failed', {
            contractId: c.id,
            err: String(pe),
          });
        }
      }
      polled += 1;
    }
    return { polled };
  }

  /** 딜룸 진입 lazy 폴링 — staleMs 이상 안 봤을 때만 동기화(throttle). */
  async reconcileIfStale(contractId: string, staleMs = 30_000): Promise<void> {
    const found = await this.deps.signingRepo.findById(contractId);
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
    const contract = await this.deps.signingRepo.findByProviderRef(providerRef);
    if (!contract) return { ok: true };
    return this.reconcileStatus(contract.id);
  }

  /**
   * dispatched 가 확인된 provider 계약을 계약 행에 바인딩하는 **유일한 커밋 지점** —
   * attach(임베드 postMessage·복구)와 자가치유(sendFromTemplate·createSendEmbedSession
   * 의 providerRef 선존재)가 공유한다. 두 번째 바인딩 경로를 만들지 않는다.
   * 전제: 호출자가 ACL·dispatched 게이트를 이미 통과시켰다.
   */
  async bindDispatchedContract(args: {
    active: SigningContract;
    rfp: RFP;
    detail: SnowSignContractDetail;
    providerContractId: string;
    actor: Actor;
    source: 'embed' | 'recovery' | 'self_heal';
    pgWsId: string;
    pgSubmittedBy?: string;
  }): Promise<ServiceResult<{ participantMismatch?: boolean }>> {
    // A lost send response must preserve the exact agreement prepared for this ref.
    const draftRef = await this.deps.signingRepo.findDraftRef(args.active.id);
    const prepared =
      draftRef?.origin === 'compose' && draftRef.providerRef === args.providerContractId
        ? (await this.deps.agreementRepo.findDraft(args.active.id))?.prepared
        : undefined;
    const committed = await this.deps.sentCommit.bindObserved({
      ...args,
      ...(prepared ? { sentDocument: prepared } : {}),
    });
    if (!committed.ok) return committed;
    if (committed.shouldFinalize) {
      try {
        await this.ensureFinalized(args.active.id);
      } catch (error) {
        logger.error('signing.bind_finalize_failed', {
          contractId: args.active.id,
          err: String(error),
        });
        captureSigningError('signing.bind_finalize_failed', error, {
          contractId: args.active.id,
          rfpCode: args.rfp.code,
        });
      }
    }
    return { ok: true, participantMismatch: committed.participantMismatch };
  }

  /** 공급자가 completed 라고 답할 때만 종결을 민다(멱등). 실패는 폴링이 만회한다. */
  async ensureFinalizedIfProviderCompleted(contractId: string, providerRef: string): Promise<void> {
    try {
      const detail = await this.deps.snowsign.getContract(providerRef, {
        maxRetries: 1,
      });
      if (mapProviderContractStatus(detail.status) === 'completed') {
        await this.ensureFinalized(contractId);
      }
    } catch (e) {
      logger.warn('signing.reattach_finalize_probe_failed', {
        contractId,
        err: String(e),
      });
    }
  }
}
