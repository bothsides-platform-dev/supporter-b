'use client';

/**
 * SigningTab — 딜룸 '계약' 탭 본문(buyer·PG 공통).
 *
 * 상태 파생은 signing-view-model 이 전담하고 여기선 헤더 · 타임라인 · (상태별) 발송
 * 임베드 또는 완료 문서 · 액션 바를 고정 순서로 그리고 액션을 실행한다. 임베드(awaiting)와
 * 문서(completed)는 상태상 상호배타라 실제로 렌더되는 구역은 언제나 셋이다. ACL 은 서버
 * 액션에서 재검증하므로 표시·발신만 담당한다. 완료본 다운로드는 302 프록시 링크(로컬 보관 없음).
 */
import { useState } from 'react';
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

  // 발송 임베드 — 열려 있으면 iframe url 을 들고 있다. 세션 발급은 서버가 리스를
  // 잡으므로(담당자 둘이 동시에 열지 못하게) 버튼을 누른 시점에만 발급한다.
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);

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
      // 라고 말하면 거짓말이 된다(메일은 한 통도 안 나갔고 PG 가 다시 골라야 한다).
      toast(r.degraded ? 'PG사가 보낼 계약서를 다시 골라야 해요' : okMsg, {
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
      setEmbedUrl(r.iframeUrl);
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
   */
  async function onEmbedComplete(providerContractId: string) {
    setBusy(true);
    try {
      const r = await attachSigningContractAction({ rfpCode, providerContractId });
      if (!r.ok) {
        toast(signingErrorMessage(r.error, '계약서를 보내지 못했어요'), { type: 'error' });
        return;
      }
      setEmbedUrl(null);
      // 이미 발송된 계약이라 막지 않는다 — 잘못 갔다는 사실을 알리고 취소로 유도한다.
      toast(
        r.participantMismatch
          ? '계약서를 보냈지만 구매사 담당자가 수신자에 없어요. 확인하고 필요하면 취소해 주세요.'
          : '계약서를 보냈어요',
        { type: r.participantMismatch ? 'error' : 'success' },
      );
      router.refresh();
    } catch (err) {
      captureActionError('signing.embed_attach', err, null, { actionId: 'upload' });
      toast(signingErrorMessage(undefined, '계약서를 보내지 못했어요'), { type: 'error' });
    } finally {
      setBusy(false);
    }
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

      {embedUrl && (
        <SigningSendEmbed
          iframeUrl={embedUrl}
          buyerSigner={buyerSigner}
          onComplete={(id) => void onEmbedComplete(id)}
          onClose={() => setEmbedUrl(null)}
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
            disabled={busy || (a.id === 'upload' && embedUrl !== null)}
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
