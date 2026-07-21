'use client';

/**
 * SigningTab — 딜룸 '계약' 탭 본문(buyer·PG 공통).
 *
 * 상태 파생은 signing-view-model 이 전담하고 여기선 세 구역(헤더 · 타임라인 ·
 * 액션 바)을 고정 순서로 그리고 액션을 실행한다. ACL 은 서버 액션에서 재검증하므로
 * 표시·발신만 담당한다. 완료본 다운로드는 302 프록시 링크(로컬 보관 없음).
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
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { cancelSigningAction } from '@/lib/server/actions/signing/cancelSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import type { SigningView } from '@/lib/types/signing';
import { SigningTimeline } from './SigningTimeline';
import {
  buildSigningCardView,
  type SigningAction,
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
}: {
  rfpCode: string;
  signing: SigningView;
  side: SigningSide;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { contract } = signing;
  const v = buildSigningCardView(signing, side);
  const Icon = ICONS[v.icon];

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    failMsg: string,
  ) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast(signingErrorMessage(r.error, failMsg), { type: 'error' });
        return;
      }
      toast(okMsg, { type: 'success' });
      router.refresh();
    } catch {
      toast(signingErrorMessage(undefined, failMsg), { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function onAction(a: SigningAction) {
    const okMsg = a.okMsg ?? '완료했어요';
    const failMsg = a.failMsg ?? '처리하지 못했어요';
    switch (a.id) {
      case 'template':
        router.push('/signing-templates');
        return;
      case 'remind':
        void run(() => remindSigningAction({ contractId: contract.id }), okMsg, failMsg);
        return;
      case 'cancel':
        setCancelOpen(true);
        return;
      case 'resend':
        void run(() => resendSigningAction({ rfpCode }), okMsg, failMsg);
        return;
    }
  }

  const cancelAction = v.actions.find((a) => a.id === 'cancel');

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
            disabled={busy}
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
            cancelAction?.okMsg ?? '완료했어요',
            cancelAction?.failMsg ?? '처리하지 못했어요',
          );
          setCancelOpen(false);
        }}
      />
    </section>
  );
}
