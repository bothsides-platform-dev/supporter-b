'use client';

/**
 * SigningTab — 딜룸 '계약' 탭 본문(buyer·PG 공통).
 *
 * 상태 파생은 signing-view-model 이 전담하고 여기선 헤더 · 타임라인 · (상태별) 발송
 * 임베드 또는 완료 문서 · 액션 바를 고정 순서로 그리고 액션을 실행한다. 임베드(awaiting)와
 * 문서(completed)는 상태상 상호배타라 실제로 렌더되는 구역은 언제나 셋이다. ACL 은 서버
 * 액션에서 재검증하므로 표시·발신만 담당한다. 완료본 다운로드는 302 프록시 링크(로컬 보관 없음).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  FileText,
  XCircle,
} from 'lucide-react';

import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { captureActionError } from '@/lib/observability/capture';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { EMBED_HEARTBEAT_MS } from '@/lib/signing/embed-lease';
import { NEW_TAB_DOWNLOAD_NOTICE } from '@/lib/a11y/link-notice';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { sendSigningContractFromTemplateAction } from '@/lib/server/actions/signing/sendSigningContractFromTemplateAction';
import { cancelSigningAction } from '@/lib/server/actions/signing/cancelSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import { issueSigningSendEmbedSessionAction } from '@/lib/server/actions/signing/issueSigningSendEmbedSessionAction';
import { attachSigningContractAction } from '@/lib/server/actions/signing/attachSigningContractAction';
import { releaseSigningSendEmbedAction } from '@/lib/server/actions/signing/releaseSigningSendEmbedAction';
import { renewSigningSendEmbedAction } from '@/lib/server/actions/signing/renewSigningSendEmbedAction';
import { takeoverSigningSendEmbedAction } from '@/lib/server/actions/signing/takeoverSigningSendEmbedAction';
import { getSigningSendHolderAction } from '@/lib/server/actions/signing/getSigningSendHolderAction';
import { subscribeToLiveNotifications } from '@/lib/hooks/useNotifications';
import { isSendTakenOverFor } from '@/lib/signing/takeover-signal';
import { listSigningRecoveryCandidatesAction } from '@/lib/server/actions/signing/listSigningRecoveryCandidatesAction';
import type { SigningView } from '@/lib/types/signing';
import { SigningTimeline } from './SigningTimeline';
import { SigningSendModal } from './SigningSendModal';
import { SigningRecoveryDialog } from './SigningRecoveryDialog';
import {
  buildSigningCardView,
  type SigningAction,
  type SigningActionId,
  type SigningIcon,
  type SigningSide,
} from './signing-view-model';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';


const ICONS: Record<SigningIcon, typeof Clock> = {
  clock: Clock,
  alert: AlertTriangle,
  pen: FileSignature,
  check: CheckCircle2,
  x: XCircle,
  slash: Ban,
};

const TONE_TEXT = {
  primary: 'text-[var(--md-sys-color-primary)]',
  tertiary: 'text-[var(--md-sys-color-tertiary)]',
  warning: 'text-[var(--md-sys-color-warning)]',
  error: 'text-[var(--md-sys-color-error)]',
  surface: 'text-[var(--md-sys-color-on-surface-variant)]',
} as const;

export function SigningTab({
  rfpCode,
  signing,
  side,
  buyerSigner,
  linkedSigningTemplateName,
}: {
  rfpCode: string;
  signing: SigningView;
  side: SigningSide;
  /** PG 전용 — 임베드에서 수신자로 넣어야 할 구매사 담당자. 구매사 호출부는 넘기지 않는다. */
  buyerSigner?: { name: string; email: string } | null;
  /** PG 전용 — 낙찰 견적에 연결된 계약서 템플릿 이름. 있으면 임베드 없이 바로 보내는
   *  지름길 액션(`sendFromTemplate`)이 뷰모델에 추가된다. */
  linkedSigningTemplateName?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // 템플릿 발송 확인창 — 법적 문서가 원클릭으로 나가면 안 된다. 어떤 템플릿이 누구에게
  // 가는지 보여준 뒤에야 발송한다(cancel 확인창과 같은 패턴).
  const [templateSendCopy, setTemplateSendCopy] = useState<{ okMsg: string; failMsg: string } | null>(
    null,
  );
  // 취소 확인 다이얼로그는 언마운트되지 않고 계약 상태가 바뀔 수 있다(웹훅+refresh
  // 로 completed/declined/expired 전이) — 확정 시점에 v.actions 를 다시 찾으면
  // 'cancel' 액션이 사라져 일반 폴백 문구('완료했어요')로 잘못 안내한다. 다이얼로그를
  // 여는 시점의 문구를 그대로 들고 가 이 드리프트를 막는다.
  const [cancelCopy, setCancelCopy] = useState<{ okMsg: string; failMsg: string } | null>(null);

  const { contract } = signing;
  const v = buildSigningCardView(signing, side, { linkedTemplateName: linkedSigningTemplateName });
  const Icon = ICONS[v.icon];

  // 발송 임베드 — 열려 있으면 iframe url 과 리스 시각을 들고 있다. 세션 발급은 서버가
  // 리스를 잡으므로(담당자 둘이 동시에 열지 못하게) 버튼을 누른 시점에만 발급하고,
  // 닫을 때 그 리스를 반납한다(claimedAt 이 반납의 열쇠).
  const [embed, setEmbed] = useState<{ url: string; claimedAt: string } | null>(null);
  // 보낸 계약서 찾기 — 여는 시점의 계약 행 id 를 함께 얼려 둔다. 다이얼로그가 열려
  // 있는 동안 resend 가 새 라운드를 열 수 있고, 그러면 사용자가 보던 것과 다른 행에
  // 붙는다(cancelCopy 스냅샷과 같은 이유).
  const [recover, setRecover] = useState<{ contractId: string } | null>(null);
  // 이어받기 확인 — 여는 시점의 이름을 얼려 둔다(cancelCopy 와 같은 이유이고 실패
  // 모드는 더 나쁘다: 그 사이 리스 주인이 바뀌면 엉뚱한 동료 이름으로 확인을 받는다).
  // `template` 이 실려 있으면 임베드가 아니라 템플릿 지름길 발송의 이어받기다 —
  // 확인 시 임베드 세션 대신 takeOver 발송을 다시 부른다(문구도 그때 쓴다).
  const [takeover, setTakeover] = useState<{
    name: string;
    template?: { okMsg: string; failMsg: string };
  } | null>(null);
  // 세션 발급 왕복(스노우싸인 재시도까지 하면 수십 초) 동안 뺏길 수 있다. 그때 알림은
  // 이미 도착해 있고 우리는 아직 패널이 없어 닫을 것도 없으므로, 발급이 끝난 뒤
  // 열지 말지를 이 플래그로 판단한다. 안 그러면 이미 남의 것인 리스로 패널이 열린다.
  const takenOverRef = useRef(false);

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string; degraded?: boolean }>,
    okMsg: string,
    failMsg: string,
    actionId: SigningActionId,
  ) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast(signingErrorMessage(r.error, failMsg), { type: 'error' });
        return;
      }
      // 저하 경로 — 직전 계약서가 사라져 아무것도 발송되지 않았다. '다시 발송했어요'
      // 라고 말하면 거짓말이 된다(메일은 한 통도 안 나갔다). 다음 행동은 보는 사람에
      // 따라 다르다: PG 본인에게는 직접 말하고(3인칭 금지), 연결된 템플릿이 있으면
      // 새 대기 라운드에서 지름길이 다시 열리므로 그 경로를 함께 안내한다.
      const degradedMsg =
        side === 'pg'
          ? linkedSigningTemplateName
            ? '연결된 템플릿으로 바로 보내거나, 계약서를 다시 올려 주세요'
            : '계약서를 다시 올려 주세요'
          : 'PG사가 계약서를 다시 올려야 해요';
      toast(r.degraded ? degradedMsg : okMsg, {
        type: r.degraded ? 'info' : 'success',
      });
      router.refresh();
    } catch (err) {
      captureActionError('signing.tab_action', err, null, { actionId });
      toast(signingErrorMessage(undefined, failMsg), { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * 리스를 쥔 동료의 이름. 못 얻으면 '다른 담당자' — 이름이 없다고 이어받기를 막을
   * 이유는 없고, raw 에러 코드를 사람 이름 자리에 넣을 수는 더더욱 없다.
   */
  async function holder(): Promise<{ name: string; isSelf: boolean }> {
    try {
      const h = await getSigningSendHolderAction({ rfpCode });
      if (!h.ok) return { name: '다른 담당자', isSelf: false };
      return { name: h.holder?.name ?? '다른 담당자', isSelf: h.isSelf };
    } catch {
      return { name: '다른 담당자', isSelf: false };
    }
  }

  /**
   * 템플릿 지름길 발송 — 일반 실패는 토스트로 끝나지만 SEND_HELD_BY_TEAMMATE 는
   * 실패가 아니라 선택지다(임베드·복구 진입점과 같은 계약): 이어받기 확인창을 열고,
   * 자기 리스면 안내만 한다(이어받아도 같은 사람의 화면이 둘 살아날 뿐이다).
   */
  async function runTemplateSend(
    copy: { okMsg: string; failMsg: string },
    takeOver: boolean,
  ): Promise<'held' | 'done'> {
    setBusy(true);
    try {
      const r = await sendSigningContractFromTemplateAction(
        takeOver ? { rfpCode, takeOver: true } : { rfpCode },
      );
      if (!r.ok) {
        if (r.error === 'SEND_HELD_BY_TEAMMATE' && !takeOver) {
          const h = await holder();
          if (h.isSelf) {
            toast('다른 탭에서 계약서를 작성하고 있어요. 그 탭에서 이어서 하거나 닫아 주세요.', {
              type: 'info',
            });
            return 'done';
          }
          // 확인창을 **닫지 않는다** — 호출부가 'held' 를 보고 같은 확인창을 이어받기
          // 확인으로 바꾼다(아래 JSX). 새 확인창을 열고 이걸 닫으면 닫히는 쪽이 자기
          // 트리거로 포커스를 되돌려 배경으로 샌다.
          setTakeover({ name: h.name, template: copy });
          return 'held';
        }
        // 이어받은 뒤에도 막혔다면 그 사이 동료가 발송을 끝냈다는 뜻이다(강제 취득은
        // 경합만 무시할 뿐 `awaiting` 상태 조건은 그대로다). '작성 중'이라고 말하면
        // 이미 나간 계약을 두고 기다리게 되므로 화면을 새로 읽어 온다.
        if (r.error === 'SEND_HELD_BY_TEAMMATE' && takeOver) router.refresh();
        toast(signingErrorMessage(r.error, copy.failMsg), { type: 'error' });
        return 'done';
      }
      toast(copy.okMsg, { type: 'success' });
      router.refresh();
      return 'done';
    } catch (err) {
      captureActionError('signing.tab_action', err, null, { actionId: 'sendFromTemplate' });
      toast(signingErrorMessage(undefined, copy.failMsg), { type: 'error' });
      return 'done';
    } finally {
      setBusy(false);
    }
  }

  /** 확인을 받은 뒤에만 부른다 — 기본 경로(openEmbed)는 절대 밀어내지 않는다. */
  async function confirmTakeover() {
    // 템플릿 지름길의 이어받기 — 임베드 세션이 아니라 takeOver 발송을 다시 부른다.
    // 확인창 하나가 두 역할을 하므로 여기서 **둘 다** 내린다.
    if (takeover?.template) {
      const copy = takeover.template;
      await runTemplateSend(copy, true);
      setTakeover(null);
      setTemplateSendCopy(null);
      return;
    }
    setBusy(true);
    takenOverRef.current = false;
    try {
      const r = await takeoverSigningSendEmbedAction({ rfpCode });
      if (!r.ok) {
        toast(signingErrorMessage(r.error, '이어받지 못했어요'), { type: 'error' });
        return;
      }
      setTakeover(null);
      setEmbed({ url: r.iframeUrl, claimedAt: r.claimedAt });
    } catch (err) {
      captureActionError('signing.embed_takeover', err, null, { actionId: 'upload' });
      toast(signingErrorMessage(undefined, '이어받지 못했어요'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /** 임베드 세션 발급 → 패널 열기. 실패(리스 선점·SnowSign 오류)는 토스트로만 알린다. */
  async function openEmbed() {
    setBusy(true);
    takenOverRef.current = false;
    try {
      const r = await issueSigningSendEmbedSessionAction({ rfpCode });
      if (!r.ok) {
        // 동료가 쥐고 있는 건 '실패'가 아니라 선택지다 — 토스트로 끝내면 사용자가 할
        // 수 있는 게 없다(자리를 비운 탭은 하트비트로 리스를 무한 연장한다).
        if (r.error === 'SEND_HELD_BY_TEAMMATE') {
          const h = await holder();
          // 쥔 게 자기 자신이면 이어받을 것이 없다. 이어받게 두면 같은 사람의 iframe 이
          // 둘 살아나는데(알림은 자기에게 안 가므로 옛 탭이 안 닫힌다) 그건 이 기능이
          // 막으려는 상태 그 자체다.
          if (h.isSelf) {
            toast('다른 탭에서 계약서를 작성하고 있어요. 그 탭에서 이어서 하거나 닫아 주세요.', {
              type: 'info',
            });
            return;
          }
          setTakeover({ name: h.name });
          return;
        }
        toast(signingErrorMessage(r.error, '계약서 화면을 열지 못했어요'), { type: 'error' });
        return;
      }
      // 기다리는 사이 뺏겼다면 이 세션은 이미 남의 리스 위에 있다 — 열지 않는다.
      if (takenOverRef.current) {
        toast(signingErrorMessage('SEND_TAKEN_OVER', '계약서 작성이 중단됐어요'), {
          type: 'error',
        });
        return;
      }
      setEmbed({ url: r.iframeUrl, claimedAt: r.claimedAt });
    } catch (err) {
      captureActionError('signing.embed_open', err, null, { actionId: 'upload' });
      toast(signingErrorMessage(undefined, '계약서 화면을 열지 못했어요'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * 임베드가 계약 생성을 알렸다 — 서버가 재조회로 검증하고 바인딩한다.
   * 여기서 온 id 는 아직 신뢰 대상이 아니다(서버가 진짜 게이트).
   *
   * 바인딩 성공 여부를 돌려준다 — 실패면 임베드가 완료 가드를 풀어 재시도를 받는다.
   */
  async function onEmbedComplete(providerContractId: string): Promise<boolean> {
    setBusy(true);
    try {
      const r = await attachSigningContractAction({ rfpCode, providerContractId });
      if (!r.ok) {
        toast(signingErrorMessage(r.error, '계약서를 보내지 못했어요'), { type: 'error' });
        return false;
      }
      setEmbed(null);
      // 이미 발송된 계약이라 막지 않는다 — 잘못 갔다는 사실을 알리고 취소로 유도한다.
      toast(
        r.participantMismatch
          ? '계약서를 보냈지만 구매사 담당자가 수신자에 없어요. 확인하고 필요하면 취소해 주세요.'
          : '계약서를 보냈어요',
        { type: r.participantMismatch ? 'error' : 'success' },
      );
      router.refresh();
      return true;
    } catch (err) {
      captureActionError('signing.embed_attach', err, null, { actionId: 'upload' });
      toast(signingErrorMessage(undefined, '계약서를 보내지 못했어요'), { type: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // 하트비트 — 패널이 열려 있는 동안만 리스를 연장한다. 리스를 짧게(5분) 가져가는
  // 대신 이 핑이 세션을 살려 두므로, 탭 닫기·크래시·이탈이 전부 "핑이 멎음" 하나로
  // 수렴해 유령 리스가 스스로 만료된다.
  //
  // 최신 토큰은 ref 로 들고 간다: interval 콜백이 매번 새로 만들어지지 않게 하면서도
  // 직전 연장이 돌려준 값을 쓰기 위해서다(옛 토큰으로는 서버가 거절한다).
  const claimRef = useRef<string | null>(null);
  useEffect(() => {
    claimRef.current = embed?.claimedAt ?? null;
  }, [embed]);

  // 연장은 절대 겹치면 안 된다. 하나가 느릴 때(서버 액션 큐 대기·SnowSign 재시도로
  // 최대 수십 초) 다음 틱이 **같은 옛 토큰**으로 또 나가면 서버 CAS 가 두 번째를
  // 거절하고, 화면은 그걸 '리스를 뺏겼다'로 오독해 패널을 닫는다 — 리스는 멀쩡한데
  // 작업 중이던 계약서만 날아간다.
  const renewingRef = useRef(false);
  /** 연속 CONTRACT_BUSY 횟수. 한 번은 다음 주기가 만회할 수 있는 경합이다. */
  const busyStreakRef = useRef(0);
  const renewNow = useCallback(() => {
    const claimedAt = claimRef.current;
    if (!claimedAt || renewingRef.current) return;
    renewingRef.current = true;
    void renewSigningSendEmbedAction({ rfpCode, claimedAt })
      .then((r) => {
        if (r.ok) {
          // ref 를 여기서 직접 갱신한다 — 동기화 effect 에만 맡기면, 느린 연장 직후
          // 곧바로 다음 틱이 오는 경우 아직 옛 토큰이 남아 있어 그걸로 요청이 나가고
          // 서버 CAS 가 거절한다(= 뺏긴 걸로 오독돼 패널이 닫힌다).
          claimRef.current = r.claimedAt;
          busyStreakRef.current = 0;
          setEmbed((prev) => (prev ? { ...prev, claimedAt: r.claimedAt } : prev));
          return;
        }
        // 서버가 가른 두 사건을 화면도 갈라야 한다. 남이 쥐고 있으면(SEND_TAKEN_OVER)
        // 그 리스로 발송하면 계약이 두 건 살아나므로 즉시 닫는다. 반면 CONTRACT_BUSY 는
        // 비었거나 **자기 낡은 토큰**이라 그냥 경합이다 — 연장 응답을 한 번 놓친 것만으로
        // 작성 중이던 계약서를 날리면 리스는 멀쩡한데 작업만 잃는다. 한 번은 봐주고,
        // 연속으로 이어지면(≈2분) 되살릴 방법이 없으므로 그때 닫는다.
        // 유예는 **거부 목록이 아니라 허용 목록**이어야 한다. 근거가 있는 코드는
        // CONTRACT_BUSY 하나뿐이다 — 비었거나 자기 낡은 토큰이라 다음 틱이 만회한다.
        // 종결 코드(ALREADY_SENT·CONTRACT_NOT_FOUND·FORBIDDEN)는 계약이 이미
        // awaiting 을 벗어났다는 뜻이라 60초를 더 줘도 되살아나지 않는다. 그동안
        // 사용자는 **못 보내는 계약 위에서** 작성을 계속하고, 완주하면 우리가 id 를
        // 받지 못하는 두 번째 계약이 살아난다(취소 핸들 없는 고아). 즉시 닫는다.
        if (r.error === 'CONTRACT_BUSY') {
          busyStreakRef.current += 1;
          if (busyStreakRef.current < 2) return;
        }
        busyStreakRef.current = 0;
        setEmbed(null);
        toast(signingErrorMessage(r.error, '계약서 작성이 중단됐어요'), { type: 'error' });
      })
      .catch((err: unknown) => {
        // 일시적 네트워크 실패는 다음 주기가 만회한다 — 패널을 닫지 않는다.
        captureActionError('signing.embed_renew', err, null, { actionId: 'upload' });
      })
      .finally(() => {
        renewingRef.current = false;
      });
  }, [rfpCode]);

  // 의존성은 '열려 있는가' 뿐이다 — embed 전체를 걸면 연장이 성공할 때마다 타이머가
  // 재생성돼 주기가 밀리고, 토큰을 ref 로 뺀 의미도 없어진다.
  const embedOpen = embed !== null;
  useEffect(() => {
    if (!embedOpen) return;
    const timer = setInterval(renewNow, EMBED_HEARTBEAT_MS);

    // 타이머만으로는 부족하다. 백그라운드 탭은 브라우저가 타이머를 조인다(크롬은
    // 분당 1회 수준, iOS Safari 는 아예 정지) — PG 가 계약서 PDF 를 받으러 메일함에
    // 다녀오는 사이 5분 리스가 만료되고, 돌아온 순간 첫 연장이 거절돼 패널이 닫힌다.
    // 복귀 시점에 한 번 더 찍어 그 창을 없앤다.
    const onWake = () => {
      if (document.visibilityState !== 'hidden') renewNow();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [embedOpen, renewNow]);

  // 뺏겼다는 알림이 곧 차단 신호다. 스노우싸인에 임베드 세션을 취소하는 API 가 없어
  // 서버는 우리 화면을 죽일 수 없다 — 발송 버튼이 이 iframe 안에만 있으므로, 알림을
  // 받는 즉시 내리는 것이 실제 차단이다. 하트비트(≤60초)는 실시간이 끊겼을 때의
  // 폴백으로 남는다: 정확성이 실시간에 기대지 않는다.
  useEffect(() => {
    // `embedOpen` 에 걸지 않는다 — 세션 발급을 기다리는 동안 도착한 알림은 청취자가
    // 없으면 그대로 사라지고(재생 없음), 우리는 이미 남의 것이 된 리스 위에 패널을
    // 연다. 탭이 살아 있는 동안 항상 듣고, 열려 있으면 닫고 아니면 플래그만 남긴다.
    return subscribeToLiveNotifications((n) => {
      if (!isSendTakenOverFor(n, rfpCode)) return;
      takenOverRef.current = true;
      // 반납은 하지 않는다 — 리스는 이미 남의 것이고, 푸는 건 그 사람 작업을 푸는
      // 꼴이다. 여기서 claimRef 를 손대지 않는 것은 위 동기화 effect 가 embed 가
      // null 이 되는 순간 비우기 때문이다(같은 검사를 또 두면 도달 불가 코드가 된다).
      setEmbed((prev) => {
        // 열려 있지 않았다면 토스트도 띄우지 않는다 — 발급 대기 중이면 openEmbed 가
        // 플래그를 보고 한 번만 알린다(같은 사건을 두 번 말하지 않는다).
        if (prev) {
          toast(signingErrorMessage('SEND_TAKEN_OVER', '계약서 작성이 중단됐어요'), {
            type: 'error',
          });
        }
        return null;
      });
    });
  }, [rfpCode]);

  /**
   * 리스를 반납한다. 반납 실패는 사용자에게 알리지 않는다 — 최악이라도 5분 뒤
   * 리스가 스스로 만료된다.
   */
  const releaseClaim = useCallback(
    (claimedAt: string) => {
      void releaseSigningSendEmbedAction({ rfpCode, claimedAt }).catch((err: unknown) => {
        captureActionError('signing.embed_release', err, null, { actionId: 'upload' });
      });
    },
    [rfpCode],
  );

  // 언마운트에서도 반납한다. 닫기 버튼만 반납하면 딜룸 탭 전환·모달 닫기로 빠져나갈 때
  // 리스만 남고 하트비트가 멎어, 닫기 회귀와 똑같이 본인이 최대 5분 잠긴다.
  //
  // 닫기·발송 성공 뒤에는 위 동기화 effect 가 `embed` 가 null 이 되는 순간 claimRef 를
  // 비우므로 여기서 또 반납하지 않는다(테스트로 고정: '닫은 뒤 언마운트해도 반납은
  // 한 번뿐이다'). 설령 옛 토큰이 남아도 서버 CAS 가 정확 일치를 요구해 무해하다.
  useEffect(
    () => () => {
      const claimedAt = claimRef.current;
      if (claimedAt) releaseClaim(claimedAt);
    },
    [releaseClaim],
  );

  /**
   * 임베드를 닫는다 — 리스를 반납해야 방금 닫은 본인이 다시 열지 못하는 일이 없다.
   */
  function closeEmbed() {
    const claimedAt = embed?.claimedAt;
    setEmbed(null);
    if (claimedAt) releaseClaim(claimedAt);
  }

  function onAction(a: SigningAction) {
    const okMsg = a.okMsg ?? '완료했어요';
    const failMsg = a.failMsg ?? '처리하지 못했어요';
    switch (a.id) {
      case 'sendFromTemplate':
        setTemplateSendCopy({ okMsg, failMsg });
        return;
      case 'upload':
        void openEmbed();
        return;
      case 'recover':
        setRecover({ contractId: contract.id });
        return;
      case 'remind':
        void run(() => remindSigningAction({ contractId: contract.id }), okMsg, failMsg, 'remind');
        return;
      case 'cancel':
        setCancelCopy({ okMsg, failMsg });
        setCancelOpen(true);
        return;
      case 'resend':
        void run(() => resendSigningAction({ rfpCode }), okMsg, failMsg, 'resend');
        return;
    }
  }

  // 이어받기 확인 문구는 진입점이 둘(임베드 확인창 / 템플릿 발송 확인창이 제자리에서
  // 바뀐 것)이지만 **말은 하나여야 한다** — 각자 쓰면 한쪽만 고쳐져 같은 비가역 조작을
  // 다르게 설명하게 된다.
  const takeoverName = takeover?.name ?? '다른 담당자';
  const takeoverTitle = `${takeoverName} 님의 작성을 이어받을까요?`;
  // '복구할 수 없어요'가 아니라 '관리할 수 없어요'다 — 취소는 provider_ref 로
  // 동작하는데 진 쪽 계약은 그 값을 받지 못한다. 딜룸에서 손댈 수 없다는 뜻.
  const takeoverDescription = `이어받으면 ${takeoverName} 님 화면은 바로 닫혀요. 다만 그 순간 이미 발송을 누르고 있었다면 구매사에 서명 요청이 두 번 갈 수 있고, 그중 하나는 딜룸에서 관리할 수 없어요.`;
  /** 템플릿 발송 확인창이 지금 이어받기 확인으로 바뀌어 있는가. */
  const templateTakeover = takeover?.template ?? null;

  return (
    <section className="rounded-[10px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)]">
      <header className="flex items-start gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <Icon className={'mt-px size-[18px] shrink-0 ' + TONE_TEXT[v.tone]} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold">{v.title}</h3>
          <p className={'mt-0.5 text-[12.5px] ' + dim}>{v.description}</p>
        </div>
        <Chip color={v.chip.color} label={v.chip.label} />
      </header>

      <SigningTimeline nodes={v.nodes} />

      {embed && (
        <SigningSendModal
          key={embed.url}
          iframeUrl={embed.url}
          buyerSigner={buyerSigner}
          onComplete={onEmbedComplete}
          onClose={closeEmbed}
          // 로드 실패는 세션이 죽었을 수 있다 — 리스를 반납하고 새로 발급받는다.
          onReload={() => {
            closeEmbed();
            void openEmbed();
          }}
        />
      )}

      {v.docs.length > 0 && (
        <div className="px-4 pt-1 pb-3.5">
          {v.docs.map((d) => (
            <a
              key={d.id}
              href={`/api/signing/${contract.id}/${d.id}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-2.5 last:border-b-0 hover:opacity-80"
            >
              <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-[var(--md-sys-color-surface-container)]">
                <FileText className={'size-[15px] ' + dim} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{d.title}</span>
                <span className={'block text-[12px] ' + dim}>{d.caption}</span>
                {/* 새 탭으로 열리고 실제로는 302 로 파일이 내려온다. 시각적으로는 옆의
                    Download 아이콘이 그 사실을 알리지만 아이콘은 aria-hidden 이라,
                    접근성 이름에 실리도록 같은 뜻을 sr-only 로 덧붙인다. */}
                <span className="sr-only">{NEW_TAB_DOWNLOAD_NOTICE}</span>
              </span>
              <Download className={'size-[15px] shrink-0 ' + dim} aria-hidden />
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2.5">
        <span className={'min-w-0 flex-1 text-[12px] ' + dim}>{v.note}</span>
        {v.actions.map((a) => (
          <Button
            key={a.id}
            variant={a.variant}
            size="sm"
            color={a.danger ? 'error' : 'primary'}
            disabled={
              busy ||
              (embed !== null && (a.id === 'upload' || a.id === 'recover' || a.id === 'sendFromTemplate'))
            }
            onClick={() => onAction(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>

      {recover && (
        <SigningRecoveryDialog
          open
          onOpenChange={(o) => {
            if (!o) setRecover(null);
          }}
          scan={async () => {
            // 뺏기는 여기서 하지 않는다 — 파괴적 조작은 '계약서 올리기' 진입점 소유.
            const r = await listSigningRecoveryCandidatesAction({ rfpCode });
            return r.ok
              ? { ok: true as const, candidates: r.candidates, truncated: r.truncated }
              : { ok: false as const, error: r.error };
          }}
          confirm={async (providerContractId) => {
            const r = await attachSigningContractAction({
              rfpCode,
              providerContractId,
              expectedContractId: recover.contractId,
            });
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          }}
          onLinked={() => {
            toast('계약서를 연결했어요', { type: 'success' });
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        // 템플릿 지름길의 이어받기는 이 확인창이 아니라 **아래 발송 확인창이 제자리에서**
        // 맡는다(포커스 인계 사고 때문 — 아래 주석). 여기서 열면 확인창이 둘이 된다.
        open={takeover !== null && !takeover.template}
        onOpenChange={(o) => !busy && !o && setTakeover(null)}
        title={takeoverTitle}
        description={takeoverDescription}
        confirmLabel="이어받기"
        variant="danger"
        loading={busy}
        onConfirm={confirmTakeover}
      />

      {/*
        발송 확인 → (리스가 잡혀 있으면) **같은 확인창이 제자리에서** 이어받기 확인으로
        바뀐다. 별도 확인창을 열고 이걸 닫으면, 닫히는 쪽이 자기 트리거로 포커스를
        되돌리면서 포커스가 그 사이 `aria-hidden` 이 된 배경의 발송 버튼에 앉는다 —
        스크린리더는 아무것도 읽지 못하는데 사용자는 동료 화면을 닫는 비가역 확인을
        요구받고 있고, 거기서 Enter 를 치면 발송 확인창이 다시 열려 확인창이 둘이 된다.
        (`setState` 배칭·매크로태스크 지연으로는 못 고친다 — 언마운트가 원인이다.)
      */}
      <ConfirmDialog
        open={templateSendCopy !== null}
        onOpenChange={(o) => {
          if (busy || o) return;
          setTemplateSendCopy(null);
          setTakeover(null);
        }}
        title={templateTakeover ? takeoverTitle : '연결된 템플릿으로 보낼까요?'}
        // 어떤 계약서가 누구에게 가는지 발송 전에 그대로 보여준다 — 임베드 경로와 달리
        // 이 경로는 문서를 눈으로 확인하는 단계가 없어, 이 확인창이 유일한 검문소다.
        description={
          templateTakeover
            ? takeoverDescription
            : `'${linkedSigningTemplateName ?? '연결된 템플릿'}' 계약서를 ${
                buyerSigner
                  ? `${buyerSigner.name}(${buyerSigner.email}) 님에게`
                  : '구매사 서명 담당자에게'
              } 보내요. PG사 서명 요청은 지금 로그인한 내 이메일로 와요. 발송하면 양측에 서명 요청 메일이 나가요.`
        }
        confirmLabel={templateTakeover ? '이어받기' : '보내기'}
        variant={templateTakeover ? 'danger' : 'default'}
        loading={busy}
        onConfirm={async () => {
          if (templateTakeover) {
            await confirmTakeover();
            return;
          }
          const copy = {
            okMsg: templateSendCopy?.okMsg ?? '완료했어요',
            failMsg: templateSendCopy?.failMsg ?? '처리하지 못했어요',
          };
          // 'held' 면 이 확인창이 이어받기 확인으로 바뀌었다 — 닫으면 안 된다.
          if ((await runTemplateSend(copy, false)) === 'done') setTemplateSendCopy(null);
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(o) => !busy && setCancelOpen(o)}
        title="전자서명을 취소할까요?"
        description="취소하면 진행 중인 서명이 중단돼요. 필요하면 나중에 다시 발송할 수 있어요."
        confirmLabel="취소하기"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          await run(
            () => cancelSigningAction({ contractId: contract.id }),
            cancelCopy?.okMsg ?? '완료했어요',
            cancelCopy?.failMsg ?? '처리하지 못했어요',
            'cancel',
          );
          setCancelOpen(false);
        }}
      />
    </section>
  );
}
