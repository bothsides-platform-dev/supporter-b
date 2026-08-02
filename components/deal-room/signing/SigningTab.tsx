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
import { NEW_TAB_DOWNLOAD_NOTICE } from '@/lib/a11y/link-notice';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { cancelSigningAction } from '@/lib/server/actions/signing/cancelSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import { issueSigningSendEmbedSessionAction } from '@/lib/server/actions/signing/issueSigningSendEmbedSessionAction';
import { attachSigningContractAction } from '@/lib/server/actions/signing/attachSigningContractAction';
import { releaseSigningSendEmbedAction } from '@/lib/server/actions/signing/releaseSigningSendEmbedAction';
import { renewSigningSendEmbedAction } from '@/lib/server/actions/signing/renewSigningSendEmbedAction';
import type { SigningView } from '@/lib/types/signing';
import { SigningTimeline } from './SigningTimeline';
import { SigningSendEmbed } from './SigningSendEmbed';
import {
  buildSigningCardView,
  type SigningAction,
  type SigningActionId,
  type SigningIcon,
  type SigningSide,
} from './signing-view-model';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

/**
 * 리스 하트비트 주기. 서버의 `EMBED_SEND_LEASE_MS`(5분)보다 충분히 짧아야 한다 —
 * 백그라운드 탭에서 브라우저가 타이머를 조여도 몇 번은 놓칠 여유가 있어야 한다.
 */
const EMBED_HEARTBEAT_MS = 60_000;

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
}: {
  rfpCode: string;
  signing: SigningView;
  side: SigningSide;
  /** PG 전용 — 임베드에서 수신자로 넣어야 할 구매사 담당자. 구매사 호출부는 넘기지 않는다. */
  buyerSigner?: { name: string; email: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // 취소 확인 다이얼로그는 언마운트되지 않고 계약 상태가 바뀔 수 있다(웹훅+refresh
  // 로 completed/declined/expired 전이) — 확정 시점에 v.actions 를 다시 찾으면
  // 'cancel' 액션이 사라져 일반 폴백 문구('완료했어요')로 잘못 안내한다. 다이얼로그를
  // 여는 시점의 문구를 그대로 들고 가 이 드리프트를 막는다.
  const [cancelCopy, setCancelCopy] = useState<{ okMsg: string; failMsg: string } | null>(null);

  const { contract } = signing;
  const v = buildSigningCardView(signing, side);
  const Icon = ICONS[v.icon];

  // 발송 임베드 — 열려 있으면 iframe url 과 리스 시각을 들고 있다. 세션 발급은 서버가
  // 리스를 잡으므로(담당자 둘이 동시에 열지 못하게) 버튼을 누른 시점에만 발급하고,
  // 닫을 때 그 리스를 반납한다(claimedAt 이 반납의 열쇠).
  const [embed, setEmbed] = useState<{ url: string; claimedAt: string } | null>(null);

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
      // 라고 말하면 거짓말이 된다(메일은 한 통도 안 나갔고 PG 가 다시 올려야 한다).
      toast(r.degraded ? 'PG사가 계약서를 다시 올려야 해요' : okMsg, {
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

  /** 임베드 세션 발급 → 패널 열기. 실패(리스 선점·SnowSign 오류)는 토스트로만 알린다. */
  async function openEmbed() {
    setBusy(true);
    try {
      const r = await issueSigningSendEmbedSessionAction({ rfpCode });
      if (!r.ok) {
        toast(signingErrorMessage(r.error, '계약서 화면을 열지 못했어요'), { type: 'error' });
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

  // 의존성은 '열려 있는가' 뿐이다 — embed 전체를 걸면 연장이 성공할 때마다 타이머가
  // 재생성돼 주기가 밀리고, 토큰을 ref 로 뺀 의미도 없어진다.
  const embedOpen = embed !== null;
  useEffect(() => {
    if (!embedOpen) return;
    const timer = setInterval(() => {
      const claimedAt = claimRef.current;
      if (!claimedAt) return;
      void renewSigningSendEmbedAction({ rfpCode, claimedAt })
        .then((r) => {
          if (r.ok) {
            setEmbed((prev) => (prev ? { ...prev, claimedAt: r.claimedAt } : prev));
            return;
          }
          // 리스를 뺏겼다(만료 후 다른 담당자가 취득). 그대로 두면 뺏긴 리스로 발송해
          // 계약이 두 건 살아난다 — 패널을 닫고 알린다.
          setEmbed(null);
          toast(signingErrorMessage(r.error, '계약서 작성이 중단됐어요'), { type: 'error' });
        })
        .catch((err: unknown) => {
          // 일시적 네트워크 실패는 다음 주기가 만회한다 — 패널을 닫지 않는다.
          captureActionError('signing.embed_renew', err, null, { actionId: 'upload' });
        });
    }, EMBED_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [embedOpen, rfpCode]);

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
      case 'upload':
        void openEmbed();
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
        <SigningSendEmbed
          iframeUrl={embed.url}
          buyerSigner={buyerSigner}
          onComplete={onEmbedComplete}
          onClose={closeEmbed}
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
            disabled={busy || (a.id === 'upload' && embed !== null)}
            onClick={() => onAction(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>

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
