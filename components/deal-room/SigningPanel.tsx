'use client';

/**
 * SigningPanel — 딜룸 전자서명 상태 패널(buyer·PG 공통). 서버가 내려준 SigningView
 * 하나로 상태별(awaiting/sent/in_progress/completed/declined/expired/canceled) 화면을
 * 렌더하고, 리마인더·취소·재발송 액션과 완료본 온디맨드 다운로드를 노출한다. ACL 은
 * 서버 액션(양측)에서 재검증하므로 여기선 표시·발신만 담당한다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  RefreshCw,
} from 'lucide-react';

import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { LocalTime } from '@/components/primitives/LocalTime';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { cancelSigningAction } from '@/lib/server/actions/signing/cancelSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import type {
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantRole,
  SigningParticipantStatus,
  SigningView,
} from '@/lib/types/signing';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

function contractChip(status: SigningContractStatus): { color: ChipColor; label: string } {
  switch (status) {
    case 'awaiting_pg_template':
      return { color: 'warning', label: 'PG사가 계약서 준비 중' };
    case 'sent':
    case 'in_progress':
      return { color: 'primary', label: '서명 진행 중' };
    case 'completed':
      return { color: 'tertiary', label: '서명 완료' };
    case 'declined':
      return { color: 'error', label: '거절됨' };
    case 'expired':
      return { color: 'error', label: '만료됨' };
    case 'canceled':
      return { color: 'surface', label: '취소됨' };
  }
}

function participantChip(status: SigningParticipantStatus): { color: ChipColor; label: string } {
  switch (status) {
    case 'signed':
      return { color: 'tertiary', label: '서명 완료' };
    case 'viewed':
      return { color: 'primary', label: '열람함' };
    case 'rejected':
      return { color: 'error', label: '거절' };
    case 'pending':
      return { color: 'surface', label: '서명 대기' };
  }
}

const roleLabel = (r: SigningParticipantRole) => (r === 'buyer' ? '구매사' : 'PG');
const securityLabel = (m: SigningParticipant['securityMethod']) =>
  m === 'easy_cert' ? '휴대폰 간편인증' : '이메일 인증';

function Party({ p }: { p: SigningParticipant }) {
  const chip = participantChip(p.status);
  return (
    <div className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-2.5 last:border-b-0">
      <span
        className={
          'grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold ' +
          (p.role === 'buyer'
            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
            : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]')
        }
      >
        {p.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium">
          {p.name} <span className={dim + ' font-normal'}>· {roleLabel(p.role)}</span>
        </div>
        <div className={'truncate text-[12px] ' + dim}>
          {p.email} · {securityLabel(p.securityMethod)}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Chip color={chip.color} label={chip.label} />
        {p.signedAt && (
          <span className={'md-numeric text-[11.5px] ' + dim}>
            <LocalTime iso={p.signedAt} />
          </span>
        )}
      </div>
    </div>
  );
}

export function SigningPanel({ rfpCode, signing }: { rfpCode: string; signing: SigningView | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!signing) return null;

  const { contract, participants } = signing;
  const chip = contractChip(contract.status);
  const active = contract.status === 'sent' || contract.status === 'in_progress';
  const failed = contract.status === 'declined' || contract.status === 'expired';
  const signedCount = participants.filter((p) => p.status === 'signed').length;

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    failMsg: string,
  ) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast(`${failMsg} — ${r.error ?? ''}`.trim(), { type: 'error' });
      return;
    }
    toast(okMsg, { type: 'success' });
    router.refresh();
  }

  return (
    <section className="rounded-[10px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)]">
      <header className="flex items-center gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <FileSignature className="size-[17px] text-[var(--md-sys-color-on-surface-variant)]" />
        <h3 className="text-[13.5px] font-semibold">전자서명</h3>
        <span className="flex-1" />
        <Chip color={chip.color} label={chip.label} />
      </header>

      <div className="p-4">
        {contract.status === 'awaiting_pg_template' && (
          <>
            <div className="flex items-start gap-2.5 rounded-lg bg-[var(--md-sys-color-warning-container)] px-3.5 py-3 text-[var(--md-sys-color-on-warning-container)]">
              <Clock className="mt-px size-[18px] shrink-0" />
              <div>
                <div className="text-[13px] font-semibold">PG사가 계약서를 준비하고 있어요</div>
                <div className="mt-0.5 text-[12.5px] opacity-90">
                  서명 템플릿이 준비되면 자동으로 양측에 서명 링크가 발송돼요.
                </div>
              </div>
            </div>
            <p className={'mt-2.5 text-[12px] ' + dim}>선정은 이미 확정됐어요 — 서명 준비와 무관하게 유지돼요.</p>
          </>
        )}

        {active && (
          <>
            <div className="mb-3.5 flex items-center gap-2.5">
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]">
                <div
                  className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-[width]"
                  style={{ width: `${participants.length ? (signedCount / participants.length) * 100 : 0}%` }}
                />
              </div>
              <span className={'text-[12px] ' + dim}>
                <span className="md-numeric">{signedCount}</span>/<span className="md-numeric">{participants.length}</span> 서명
              </span>
            </div>
            <div className="flex flex-col">
              {participants.map((p) => (
                <Party key={p.id} p={p} />
              ))}
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Button
                variant="outlined"
                size="sm"
                icon={<Bell />}
                disabled={busy}
                onClick={() =>
                  run(
                    () => remindSigningAction({ contractId: contract.id }),
                    '리마인더를 보냈어요',
                    '리마인더를 보내지 못했어요',
                  )
                }
              >
                리마인더 보내기
              </Button>
              <Button variant="text" size="sm" color="error" disabled={busy} onClick={() => setCancelOpen(true)}>
                취소
              </Button>
            </div>
            <p className={'mt-2.5 text-[12px] ' + dim}>
              서명은 이메일 링크의 스노우싸인 페이지에서 진행돼요. 여기선 상태만 보여드려요.
            </p>
          </>
        )}

        {contract.status === 'completed' && (
          <>
            <div className="flex items-start gap-2.5 rounded-lg bg-[var(--md-sys-color-tertiary-container)] px-3.5 py-3 text-[var(--md-sys-color-on-tertiary-container)]">
              <CheckCircle2 className="mt-px size-[18px] shrink-0" />
              <div>
                <div className="text-[13px] font-semibold">모든 서명이 완료됐어요</div>
                {contract.completedAt && (
                  <div className="mt-0.5 text-[12.5px] opacity-90">
                    <LocalTime iso={contract.completedAt} />에 완결됐어요.
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Button
                variant="filled"
                size="sm"
                icon={<Download />}
                onClick={() => window.open(`/api/signing/${contract.id}/document`, '_blank', 'noopener')}
              >
                계약서 PDF
              </Button>
              <Button
                variant="outlined"
                size="sm"
                icon={<Download />}
                onClick={() => window.open(`/api/signing/${contract.id}/audit`, '_blank', 'noopener')}
              >
                감사추적인증서
              </Button>
            </div>
          </>
        )}

        {(failed || contract.status === 'canceled') && (
          <>
            <div
              className={
                'flex items-start gap-2.5 rounded-lg px-3.5 py-3 ' +
                (failed
                  ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
                  : 'bg-[var(--md-sys-color-surface-container-low)] ' + dim)
              }
            >
              <AlertTriangle className="mt-px size-[18px] shrink-0" />
              <div>
                <div className="text-[13px] font-semibold">
                  {contract.status === 'declined'
                    ? '서명이 거절됐어요'
                    : contract.status === 'expired'
                      ? '서명 기한이 지났어요'
                      : '전자서명이 취소됐어요'}
                </div>
                <div className="mt-0.5 text-[12.5px] opacity-90">
                  딜룸에서 새 라운드로 다시 발송할 수 있어요.
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Button
                variant="filled"
                size="sm"
                icon={<RefreshCw />}
                disabled={busy}
                onClick={() =>
                  run(() => resendSigningAction({ rfpCode }), '다시 발송했어요', '다시 발송하지 못했어요')
                }
              >
                다시 발송
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(o) => !busy && setCancelOpen(o)}
        title="전자서명을 취소할까요?"
        description="취소하면 진행 중인 서명이 중단돼요. 필요하면 나중에 다시 발송할 수 있어요."
        confirmLabel="취소"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          await run(
            () => cancelSigningAction({ contractId: contract.id }),
            '전자서명을 취소했어요',
            '취소하지 못했어요',
          );
          setCancelOpen(false);
        }}
      />
    </section>
  );
}
