import { type AgreementService } from './agreement';
import type { AgreementSnapshot } from '@/lib/types/agreement';
import { randomUUID } from 'node:crypto';
import type {
  BidRepo,
  PgSigningTemplateRepo,
  SigningContractRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { logger } from '@/lib/observability/logger';
import { resolveSecurityMethod, type SigningSecurityDecision } from '@/lib/signing/security-method';
import { SIGNING_ROLE_LABELS, buildSignatureFieldsPayload } from '@/lib/signing/template-fields';

// 조항형 발송 — 문서 해석·렌더·업로드. 모두 서버 전용이다.
import { resolveContractDoc } from '@/lib/contract-doc/variables';
import { collectDrawableText } from '@/lib/contract-doc/doc-text';
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
  SnowSignError,
  type SnowSignClient,
  type SnowSignContractDetail,
} from '@/lib/server/signing/snowsign-client';
import { captureSigningError } from '@/lib/server/signing/observability';
import type { RFP } from '@/lib/types/rfp';
import type {
  PgSigningTemplate,
  SigningContract,
  SigningParticipant,
  SigningTemplateFieldInput,
  SentContractSnapshot,
} from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';
import {
  type AgreementDispatchContext,
  type ComposedDispatchContext,
  type TemplateDispatchContext,
} from './contract-dispatch';
import { SigningSendLease } from './signing-send-lease';
import { SigningSentCommit, SigningSentCommitConflict } from './signing-sent-commit';
import {
  isDispatchedProviderStatus,
  isDraftAuthEnforced,
  mapProviderContractStatus,
} from './signing-policy';
import type { SigningReconciliation } from './signing-reconciliation';

/**
 * 발송 참여자 한쪽 — `buildSentParticipants` 의 입력.
 *
 * `sec` 가 **강제된 팔만** 받는 것이 의도다: 비강제 팔에는 `phone` 도 `method` 도 없어
 * 참여자 행에 쓸 값을 서비스가 **지어내야** 한다. v0.4.46.0·v0.4.50.0 을 깨뜨린
 * fail-open 이 정확히 그 모양이었으므로, 타입으로 표현 불가능하게 만든다.
 */
type SentParticipantSide = {
  userId: string;
  contact: { name: string; email: string };
  sec: Extract<SigningSecurityDecision, { enforced: true }>;
};
/** 검증된 발송 문맥으로 PDF 템플릿·조항형·공통 합의서를 발송한다. 리스, 초안 복구, 문서 렌더링과 공급자 호출을 소유한다. */
export class SigningDispatch {
  constructor(
    private readonly deps: {
      signingRepo: SigningContractRepo;
      bidRepo: BidRepo;
      userRepo: UserRepo;
      workspaceRepo: WorkspaceRepo;
      snowsign: SnowSignClient;
      templateRepo: PgSigningTemplateRepo;
      agreementService: AgreementService;
      sendLease: SigningSendLease;
      sentCommit: SigningSentCommit;
      reconciliation: SigningReconciliation;
    },
  ) {}

  /**
   * 연결된 템플릿으로 발송 — 임베드 없이 서버 API 2회(create-contract-from-template
   * + send)로 끝난다. 인터랙티브 세션이 없어 하트비트·이어받기는 필요 없지만, 두
   * 동료가 동시에 눌렀을 때 스노우싸인에 초안이 두 개 쌓이는 것은 막아야 한다 —
   * 기존 발송 리스 claim/release 를 그대로 재사용한다(하트비트 없이 claim→작업→
   * release 한 번. 성공하면 markSentIfAwaiting 이 awaiting 을 벗어나 claim 자체가
   * 의미를 잃는다).
   */
  async dispatchTemplate(context: TemplateDispatchContext): Promise<ServiceResult> {
    const { rfp, actor } = context;
    let { active, template } = context;
    const signingTemplateId = template.id;
    const opts = { takeOver: context.takeOver };
    const now = new Date();
    const claimed = (
      await this.deps.sendLease.claim({
        contractId: active.id,
        holderUserId: actor.userId,
        now,
      })
    ).ok;
    if (!claimed) {
      if (!opts?.takeOver) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
      // 이어받기 — 임베드·복구 진입점과 같은 계약(UI 확인 뒤에만 takeOver 가 실린다).
      // 임베드는 "세션을 손에 넣은 뒤에 커밋"하지만 여기서는 그 순서를 쓸 수 없다:
      // 이 경로의 공급자 호출이 곧 **발송**이라, 리스를 쥐기 전에 하면 리스가 막으려는
      // 이중 발송 그 자체가 된다. 뺏은 뒤 발송이 실패하면 동료 화면만 닫힌 셈이 되지만,
      // 그 비용은 확인 다이얼로그가 미리 경고한다.
      const took = await this.deps.sendLease.takeOver({
        rfp,
        pgWsId: actor.workspaceId,
        contractId: active.id,
        now,
        actor,
        surface: 'template',
      });
      if (!took.ok) return took;
    }

    // 리스를 쥔 **뒤에** 행을 다시 읽는다. 위 `active` 는 리스 **이전** 스냅샷이라,
    // 그 사이 다른 담당자가 초안을 만들고 발송에 실패한 뒤 리스를 반납했으면 우리는
    // `providerRef` 가 없다고 믿은 채 두 번째 초안을 만들어 **남의 ref 를 덮어쓴다**
    // (그 초안은 취소 핸들을 잃고 공급자 측 고아가 된다). 아래 재사용 판정 전체가
    // 이 스냅샷 위에서 돌아야 한다 — 상호배제 밖에서 읽은 상태로 판정하면 게이트가
    // 아니다. (`createSendEmbedSession` 도 같은 모양이지만 이 PR 범위 밖 — TODOS P3.)
    const fresh = await this.deps.signingRepo.findById(active.id);
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
        stale = await this.deps.snowsign.getContract(active.providerRef);
      } catch (e) {
        probeError = e;
        logger.warn('signing.send_probe_failed', {
          contractId: active.id,
          err: String(e),
        });
      }
      if (stale && isDispatchedProviderStatus(stale.status)) {
        const healed = await this.deps.reconciliation.bindDispatchedContract({
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
        const freshTemplate = await this.deps.templateRepo.findById(signingTemplateId);
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
          logger.warn('signing.template_draft_ref_diverged', {
            contractId: active.id,
          });
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

    const buyerContact = await this.deps.userRepo.findContactById(rfp.createdBy);
    const pgContact = await this.deps.userRepo.findContactById(actor.userId);
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
      return {
        ok: false,
        error: !pgSec.enforced ? 'PG_PHONE_REQUIRED' : 'BUYER_PHONE_REQUIRED',
      };
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
      const detail = await this.deps.snowsign.getTemplate(template.snowsignTemplateId);
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
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
      };
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
        const created = await this.deps.snowsign.createContractFromTemplate(
          template.snowsignTemplateId,
          {
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
          },
        );
        providerRef = created.contractId;
        // 발송 **전에** 적어 둔다 — 여기서 죽어도 다음 시도가 같은 초안을 재사용하고,
        // 구매사 취소 경로가 이 값으로 살아있는 계약을 실제로 취소할 수 있다.
        //
        // 출처·판본을 **같은 UPDATE 로** 쓴다: 반쪽만 남으면 다음 재시도가 이 초안을
        // 자기 것으로 알아보지 못하거나(재생성 누적), 남의 초안을 자기 것으로 오인한다.
        const bound = await this.deps.signingRepo.bindDraftRef(active.id, {
          origin: 'template',
          providerRef,
          snowsignTemplateId: template.snowsignTemplateId,
        });
        if (!bound) {
          // CAS 실패 = 리스 획득과 여기 사이에 다른 경로가 ref 를 쥐었다. 우리는 방금
          // 만든 초안의 **유일한 핸들**을 쥐고 있으므로 여기서 취소하지 않으면 공급자
          // 측에 취소 불가 고아가 남는다(삭제 API 없음). 아직 발송 전이라 메일은 0통.
          try {
            await this.deps.snowsign.cancel(providerRef, '중복 초안 정리');
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

      const sent = await this.deps.snowsign.sendContract(providerRef);
      const sentAt = sent.sentAt ?? new Date().toISOString();
      await this.deps.sentCommit.confirmCreated({
        active,
        rfp,
        actor,
        now,
        // providerRef 는 위 create 분기에서 반드시 채워졌지만 `let` 이라 클로저에서
        // 좁힘이 풀린다 — 여기 도달 시 sent.contractId 와 같은 값이다.
        providerRef: providerRef ?? sent.contractId,
        sentAt,
        participants: this.buildSentParticipants({
          contractId: active.id,
          buyer: {
            userId: rfp.createdBy,
            contact: buyerContact,
            sec: buyerSec,
          },
          pg: { userId: actor.userId, contact: pgContact, sec: pgSec },
        }),
        // 템플릿 출처·판본을 유지한다(재사용 케이스는 위 게이트가 판본 일치를 이미
        // 보장) — null 로 지우면 재시도·이력 판정 근거가 사라진다.
        draft: {
          origin: 'template',
          snowsignTemplateId: template.snowsignTemplateId,
        },
        auditMetadata: {
          contractId: active.id,
          providerRef,
          source: 'template',
          draftReused,
        },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof SigningSentCommitConflict) {
        // CAS 에서 졌다 — 두 갈래다. ① 상태가 바뀜(구매사 취소·웹훅 종결) ② 상태는
        // awaiting 그대로인데 리스를 뺏김(왕복 중 forceClaimForSend). 어느 쪽이든
        // **이 계약은 우리가 직접 만들고 발송했다** — attach 의 무보상 원칙과 달리
        // 취소 핸들을 우리가 쥐고 있으므로 best-effort 로 보상 취소한다. 살려두면
        // ①에선 취소 CAS 가 patch 를 앞질렀을 때 로컬 참조 없는 살아있는 계약이 남고,
        // ②에선 뺏은 동료의 발송과 서명 요청이 두 벌 돌아다닌다.
        const fresh = await this.deps.signingRepo.findById(active.id);
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
            await this.deps.snowsign.cancel(providerRef, '발송 경합 취소');
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
        return {
          ok: false,
          error: leaseLost ? 'SEND_TAKEN_OVER' : 'CONTRACT_CHANGED',
        };
      }
      await this.releaseClaimQuietly(active.id, now);
      logger.error('signing.send_from_template_failed', {
        contractId: active.id,
        err: String(e),
      });
      captureSigningError('signing.send_from_template_failed', e, {
        contractId: active.id,
        rfpCode: rfp.code,
      });
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SEND_FAILED',
      };
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
  async dispatchComposed(
    context: ComposedDispatchContext | AgreementDispatchContext,
  ): Promise<ServiceResult> {
    const { rfp, actor } = context;
    let { active } = context;
    const template = context.source === 'compose' ? context.template : undefined;
    const opts = { takeOver: context.takeOver };
    const now = new Date();
    const claimed = (
      await this.deps.sendLease.claim({
        contractId: active.id,
        holderUserId: actor.userId,
        now,
      })
    ).ok;
    if (!claimed) {
      if (!opts?.takeOver) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };
      // 템플릿 경로와 같은 순서 — 이 경로의 공급자 호출이 곧 발송이라 리스를 먼저 쥔다.
      const took = await this.deps.sendLease.takeOver({
        rfp,
        pgWsId: actor.workspaceId,
        contractId: active.id,
        now,
        actor,
        surface: 'compose',
      });
      if (!took.ok) return took;
    }

    // 리스를 쥔 **뒤에** 재조회한다 — 리스 이전 스냅샷으로 판정하면 그 사이 다른
    // 경로가 바인딩한 ref 를 못 보고 덮어쓴다(v0.4.55.0 이 템플릿 경로에서 고친 축).
    const fresh = await this.deps.signingRepo.findById(active.id);
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
        stale = await this.deps.snowsign.getContract(staleRef);
      } catch (e) {
        // 확인 못 하면 보내지 않는다. **ref 는 보존한다** — 지우는 순간 실제로는
        // 발송됐을지 모르는 계약의 취소 핸들을 잃는다.
        await this.releaseClaimQuietly(active.id, now);
        return {
          ok: false,
          error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
        };
      }
      if (
        isDispatchedProviderStatus(stale.status) ||
        (context.source === 'agreement' && mapProviderContractStatus(stale.status) === 'completed')
      ) {
        // Already dispatched (including completed agreements): preserve the prepared snapshot.
        const healed = await this.deps.reconciliation.bindDispatchedContract({
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
          await this.deps.snowsign.cancel(staleRef, '미발송 초안 정리');
        } catch (ce) {
          logger.warn('signing.composed_stale_draft_cancel_failed', {
            contractId: active.id,
            err: String(ce),
          });
        }
      }
    }

    const buyerContact = await this.deps.userRepo.findContactById(rfp.createdBy);
    const pgContact = await this.deps.userRepo.findContactById(actor.userId);
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
      return {
        ok: false,
        error: !pgSec.enforced ? 'PG_PHONE_REQUIRED' : 'BUYER_PHONE_REQUIRED',
      };
    }

    // ── 문서 해석 → 렌더 ─────────────────────────────────────────────────────
    //
    // 당사자 **상호**는 워크스페이스 이름이다(담당자 개인 이름이 아니다) — 계약
    // 당사자는 법인이므로 여기서 사람 이름을 쓰면 계약서가 틀린다.
    const [buyerWs, pgWs] = await Promise.all([
      this.deps.workspaceRepo.findById(rfp.buyerWsId),
      this.deps.workspaceRepo.findById(actor.workspaceId),
    ]);
    if (!buyerWs || !pgWs) {
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'COMPOSE_DOCUMENT_INVALID' };
    }
    const rendered =
      context.source === 'agreement'
        ? await this.renderAgreementDocument(active.id, actor, context.stamp, now)
        : await this.renderComposedDocument({
            template: context.template,
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

    if (context.source === 'agreement') {
      const signers = (rendered.snapshot as AgreementSnapshot).agreement.signers;
      const matches = (a: typeof signers.buyer, b: typeof buyerContact) =>
        a.name === b.name && a.email === b.email && (a.phone ?? '') === (b.phone ?? '');
      if (!matches(signers.buyer, buyerContact) || !matches(signers.pg, pgContact)) {
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: 'AGREEMENT_CHANGED' };
      }
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
        const session = await this.deps.snowsign.createUploadSession({
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
        return {
          ok: false,
          error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR',
        };
      }

      // ⚠️ 여기부터는 **업로드 슬롯을 반납하지 않는다** — 위 catch 와 의도적으로 다르다.
      // 업로드가 실패하면 공급자 세션은 쓰이지 않았으니 즉시 놓아주는 것이 맞지만, 여기까지
      // 왔다면 세션은 이미 소비됐고 공급자에 해제 엔드포인트가 없다. 슬롯을 붙들고 있는
      // 것이 공급자 상태를 그대로 비추는 셈이고, 같은 워크스페이스가 재시도하면
      // `reserveUploadSlot` 이 자기 예약을 밀어내므로 스스로 잠기지도 않는다.
      // (대가: 실패 한 번이 조직 공유 3슬롯 중 하나를 10분 TTL 만큼 묶는다.)
      const created = await this.deps.snowsign.createContract({
        title: `${rfp.title} ${context.source === 'agreement' ? '장기계약 부속합의서' : '계약서'}`,
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
      const bound = await this.deps.signingRepo.bindDraftRef(active.id, {
        origin: 'compose',
        providerRef,
      });
      if (!bound) {
        // CAS 실패 = 리스와 여기 사이에 다른 경로가 ref 를 쥐었다. 방금 만든 초안의
        // 유일한 핸들이 우리에게 있으므로 취소하지 않으면 고아가 된다(삭제 API 없음).
        try {
          await this.deps.snowsign.cancel(providerRef, '중복 초안 정리');
        } catch (ce) {
          logger.warn('signing.composed_draft_bind_lost_cancel_failed', {
            contractId: active.id,
            err: String(ce),
          });
        }
        await this.releaseClaimQuietly(active.id, now);
        return { ok: false, error: 'CONTRACT_BUSY' };
      }

      const sent = await this.deps.snowsign.sendContract(providerRef);
      const sentAt = sent.sentAt ?? new Date().toISOString();

      await this.deps.sentCommit.confirmCreated({
        active,
        rfp,
        actor,
        now,
        providerRef: providerRef ?? sent.contractId,
        sentAt,
        participants: this.buildSentParticipants({
          contractId: active.id,
          buyer: {
            userId: rfp.createdBy,
            contact: buyerContact,
            sec: buyerSec,
          },
          pg: { userId: actor.userId, contact: pgContact, sec: pgSec },
        }),
        // 출처를 compose 로 **기록한다** — null 로 지우면 발송된 계약이 출처 미상이
        // 되어 이후 어떤 판독기도 어느 경로로 나갔는지 알 수 없다. 스냅샷은 같은
        // UPDATE 로 나가므로 "발송됐는데 무엇을 보냈는지 모르는" 행이 생길 수 없다.
        draft: { origin: 'compose', sentDocument: rendered.snapshot },
        auditMetadata: {
          contractId: active.id,
          providerRef,
          source: 'compose',
          ...(template
            ? { templateId: template.id }
            : {
                agreementVersion: (rendered.snapshot as AgreementSnapshot).agreement.version,
              }),
        },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof SigningSentCommitConflict) {
        // 템플릿 경로와 같은 보상 규율 — 이 계약은 **우리가 만들고 발송했다**.
        const freshAfter = await this.deps.signingRepo.findById(active.id);
        const freshStatus = freshAfter?.contract.status;
        const sameRefBound =
          (freshStatus === 'sent' ||
            freshStatus === 'in_progress' ||
            freshStatus === 'completed') &&
          freshAfter?.contract.providerRef === providerRef;
        if (providerRef && !sameRefBound) {
          try {
            await this.deps.snowsign.cancel(providerRef, '발송 경합 취소');
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
      // 템플릿 경로(`signing.send_from_template_failed`)와 같은 모양으로 남긴다 —
      // 접두어·`logger.error`·`rfpCode` 가 빠져 있었다. 발송 실패는 사용자가 다시
      // 누르는 것 말고 할 수 있는 일이 없는 자리라, 무엇이 왜 실패했는지가 로그에만
      // 남는다. 두 경로가 다른 이름으로 새면 대시보드에서 한쪽이 통째로 안 보인다.
      await this.releaseClaimQuietly(active.id, now);
      logger.error('signing.send_composed_failed', {
        contractId: active.id,
        err: String(e),
      });
      captureSigningError('signing.send_composed_failed', e, {
        contractId: active.id,
        rfpCode: rfp.code,
      });
      return {
        ok: false,
        error: e instanceof SnowSignError ? e.code : 'SEND_FAILED',
      };
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
    | {
        ok: true;
        bytes: Uint8Array;
        fields: SigningTemplateFieldInput[];
        /** 발송 시점 고정용 — 렌더에 들어간 입력 그대로다(TODOS P2 :185). */
        snapshot: SentContractSnapshot;
      }
    | { ok: false; error: string }
  > {
    const bid = await this.deps.bidRepo.findById(input.awardedBidId);
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
      const parties = {
        buyer: {
          company: input.buyerCompany,
          bizNo: input.rfp.bizProfile?.bizNo,
        },
        pg: { company: input.pgCompany },
      };
      // 검사 대상과 **레이아웃이 그리는 것**이 같은 함수에서 나온다 — 둘이 어긋나면
      // 그려지는데 검사 안 된 필드가 생기고, 그게 서명된 계약서의 빈칸이 된다.
      const missing = missingGlyphs(
        collectDrawableText({ doc: resolved.doc, feeRows, parties }),
        coverage,
      );
      if (missing.length > 0) {
        logger.warn('signing.composed_unsupported_characters', {
          templateId: input.template.id,
          characters: missing,
        });
        return { ok: false, error: 'COMPOSE_UNSUPPORTED_CHARACTER' };
      }

      // 렌더 입력 = 스냅샷. **같은 객체**를 쓴다 — 따로 조립하면 둘이 어긋나 "보낸
      // 것과 다른 것이 보존되는" 조용한 실패가 생긴다.
      const layoutInput = { doc: resolved.doc, feeRows, parties };
      const out = await renderContractPdf(layoutInput);
      return {
        ok: true,
        bytes: out.bytes,
        fields: out.fields,
        snapshot: { _v: 1, ...layoutInput },
      };
    } catch (e) {
      logger.error('signing.composed_render_failed', {
        templateId: input.template.id,
        err: String(e),
      });
      return { ok: false, error: 'COMPOSE_RENDER_FAILED' };
    }
  }

  private async renderAgreementDocument(
    contractId: string,
    actor: Actor,
    stamp: string,
    now: Date,
  ): Promise<
    ServiceResult<{
      bytes: Uint8Array;
      fields: SigningTemplateFieldInput[];
      snapshot: AgreementSnapshot;
    }>
  > {
    try {
      const prepared = await this.deps.agreementService.prepare(contractId, actor, stamp, now);
      if (!prepared.ok) return prepared;
      const missing = missingGlyphs(
        collectDrawableText(prepared.snapshot),
        await loadGlyphCoverage(),
      );
      if (missing.length) return { ok: false, error: 'COMPOSE_UNSUPPORTED_CHARACTER' };
      const rendered = await renderContractPdf(prepared.snapshot);
      return { ok: true, ...rendered, snapshot: prepared.snapshot };
    } catch (error) {
      logger.error('signing.agreement_render_failed', {
        contractId,
        err: String(error),
      });
      return { ok: false, error: 'COMPOSE_RENDER_FAILED' };
    }
  }

  /**
   * 발송 참여자 행 — 두 발송 경로(템플릿·조항형)가 **같은 모양**을 만든다.
   *
   * 이 배열은 우리 DB 의 기록이지 공급자 페이로드가 아니다(공급자 쪽은 경로마다
   * 모양이 다르다 — 템플릿은 `phone`, 조항형은 `auth.phone`). 여기서 갈릴 이유가
   * 없고, 실제로 두 경로가 바이트 동일한 24줄을 각자 들고 있었다.
   */
  private buildSentParticipants(args: {
    contractId: string;
    buyer: SentParticipantSide;
    pg: SentParticipantSide;
  }): SigningParticipant[] {
    return (['buyer', 'pg'] as const).map((role) => {
      const side = args[role];
      return {
        id: randomUUID(),
        contractId: args.contractId,
        userId: side.userId,
        name: side.contact.name,
        email: side.contact.email,
        phone: side.sec.phone,
        role,
        securityMethod: side.sec.method,
        status: 'pending' as const,
      };
    });
  }

  private async clearDraftRefOrBackOff(
    active: SigningContract,
    expectedRef: string,
    now: Date,
  ): Promise<{ ok: false; error: string } | null> {
    if (!(await this.deps.signingRepo.clearDraftRefIf(active.id, expectedRef))) {
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
    const draft = await this.deps.signingRepo.findDraftRef(contractId);
    return draft?.origin === 'template' && draft.snowsignTemplateId === templateProviderId
      ? draft.providerRef
      : undefined;
  }

  private async releaseClaimQuietly(contractId: string, claimedAt: Date): Promise<void> {
    await this.deps.sendLease.release({ contractId, claimedAt });
  }
}
