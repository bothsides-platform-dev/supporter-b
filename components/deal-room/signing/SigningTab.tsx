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
import { captureActionError } from '@/lib/observability/capture';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { NEW_TAB_DOWNLOAD_NOTICE } from '@/lib/a11y/link-notice';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { cancelSigningAction } from '@/lib/server/actions/signing/cancelSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import { sendSigningContractAction } from '@/lib/server/actions/signing/sendSigningContractAction';
import type { SigningView } from '@/lib/types/signing';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { SigningTimeline } from './SigningTimeline';
import {
  buildSigningCardView,
  type SigningAction,
  type SigningActionId,
  type SigningIcon,
  type SigningSide,
  type SigningTemplateOption,
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
  pgTemplates,
  preselectedTemplateId,
}: {
  rfpCode: string;
  signing: SigningView;
  side: SigningSide;
  /** PG 전용 — 등록된 계약서 템플릿. 구매사 호출부는 넘기지 않는다(봉인 경계). */
  pgTemplates?: SigningTemplateOption[];
  /** PG 전용 — 견적 제출 때 고른 계약서 id(픽커 기본 선택). */
  preselectedTemplateId?: string | null;
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
  const v = buildSigningCardView(
    signing,
    side,
    pgTemplates ? { pgTemplates, preselectedTemplateId } : undefined,
  );
  const Icon = ICONS[v.icon];

  // 픽커의 선택값. 사용자가 아직 안 건드렸으면 뷰모델의 기본 선택(견적에서 고른 값)을
  // 따르고, `router.refresh()` 로 기본값이 바뀌면 그때 다시 따라간다.
  const [templateId, setTemplateId] = useState<string | null>(null);
  const pickerDefault = v.picker?.defaultValue ?? '';
  const selectedTemplateId = templateId ?? pickerDefault;

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
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
      toast(okMsg, { type: 'success' });
      router.refresh();
    } catch (err) {
      captureActionError('signing.tab_action', err, null, { actionId });
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
      case 'send':
        if (!selectedTemplateId) return; // 버튼이 disabled 라 도달하지 않는다 — 방어적.
        void run(
          () => sendSigningContractAction({ rfpCode, templateId: selectedTemplateId }),
          okMsg,
          failMsg,
          'send',
        );
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

      {v.picker && (
        <div className="space-y-1 px-4 pb-3.5">
          <Label size="md" muted={false} as="label" htmlFor="signing-template-picker">
            {v.picker.label}
          </Label>
          <Select
            id="signing-template-picker"
            ariaLabel={v.picker.label}
            options={[{ value: '', label: '선택 안 함' }, ...v.picker.options]}
            value={selectedTemplateId}
            onChange={setTemplateId}
          />
          <p className={'text-[12px] ' + dim}>{v.picker.helper}</p>
        </div>
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
            disabled={busy || (a.id === 'send' && !selectedTemplateId)}
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
