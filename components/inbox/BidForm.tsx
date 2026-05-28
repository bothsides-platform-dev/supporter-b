'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { StatutoryCardFeeNotice } from './StatutoryCardFeeNotice';
import { submitBidAction } from '@/lib/server/actions/bid';
import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import type { MerchantGrade } from '@/lib/types/biz-profile';
import { cn } from '@/lib/utils';

const CYCLE_UNITS = [
  { value: 'D', label: 'D+' },
  { value: 'W', label: 'W+' },
  { value: 'M', label: 'M+' },
] as const;

const inputBase =
  'block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] font-mono tabular-nums text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors';

const ERROR_LABELS: Record<string, string> = {
  FORBIDDEN_PG: 'PG 사용자 권한이 필요합니다.',
  FORBIDDEN: '이 RFP에 입찰할 권한이 없습니다.',
  INVALID_INPUT: '입력 값을 확인해주세요.',
  RFP_NOT_FOUND: 'RFP를 찾을 수 없습니다.',
  RFP_NOT_OPEN: '마감되었거나 이미 종료된 RFP입니다.',
  INVITATION_NOT_FOUND: '초대 내역을 찾을 수 없습니다.',
  BID_ALREADY_SUBMITTED: '이미 제안을 제출하셨습니다.',
  CARD_FEE_EXCEEDS_STATUTORY_CAP: '카드 수수료가 법정 상한을 초과합니다.',
};

function PctInput({
  label,
  value,
  onChange,
  placeholder = '0.00',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label size="md" muted={false}>{label}</Label>
      <div className="flex items-end gap-1">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputBase, 'flex-1')}
        />
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">%</span>
      </div>
    </div>
  );
}

function KrwInput({
  label,
  value,
  onChange,
  placeholder = '0',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label size="md" muted={false}>{label}</Label>
      <div className="flex items-end gap-1">
        <input
          type="number"
          min="0"
          step="1000"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputBase, 'flex-1')}
        />
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">원</span>
      </div>
    </div>
  );
}

type Props = {
  rfpId: string;
  rfpCode: string;
  grade: MerchantGrade | undefined;
};

export function BidForm({ rfpId, rfpCode, grade }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  // 정산 조건
  const [cycleUnit, setCycleUnit] = useState<'D' | 'W' | 'M'>('D');
  const [cycleNum, setCycleNum] = useState('1');
  const [settleLimit, setSettleLimit] = useState('0');
  const [guaranteeInsurance, setGuaranteeInsurance] = useState('0');

  // 수수료
  const [bankPct, setBankPct] = useState('0.50');
  const [cardPct, setCardPct] = useState('');
  const [memo, setMemo] = useState('');

  const proposalInputRef = useRef<HTMLInputElement>(null);
  const [proposal, setProposal] = useState<
    | { id: string; name: string; size: number }
    | { name: string; status: 'uploading' }
    | { name: string; status: 'error'; error: string }
    | null
  >(null);

  const uploadProposal = async (file: File): Promise<void> => {
    if (file.type !== 'application/pdf') {
      setProposal({ name: file.name, status: 'error', error: 'PDF만 업로드 가능합니다.' });
      return;
    }
    setProposal({ name: file.name, status: 'uploading' });
    const form = new FormData();
    form.append('file', file);
    form.append('ownerKind', 'bid_proposal');
    form.append('ownerId', rfpId);
    try {
      const body = await http
        .post('/api/files/upload', { body: form })
        .json<{ id: string; name: string; size: number }>()
      setProposal(body)
    } catch (err) {
      let error = err instanceof Error ? err.message : '네트워크 오류'
      if (err instanceof HTTPError) {
        const { status } = err.response
        error =
          status === 413
            ? '파일이 너무 큽니다 (최대 20MB)'
            : status === 415
              ? '지원되지 않는 파일 형식입니다'
              : `업로드 실패 (${status})`
      }
      setProposal({ name: file.name, status: 'error', error })
    }
  };

  const proposalReady = proposal && 'id' in proposal;
  const proposalUploading = proposal && 'status' in proposal && proposal.status === 'uploading';

  const allowCardInput = grade === undefined || grade === 'general';
  const cardFeeStatutory = grade && grade !== 'general' ? STATUTORY_CARD_FEE[grade] : null;

  const settleCycle = `${cycleUnit}+${cycleNum || '1'}`;

  const canSubmit =
    !pending &&
    !proposalUploading &&
    cycleNum !== '' && parseInt(cycleNum) > 0 &&
    bankPct !== '' && parseFloat(bankPct) >= 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = () => {
    setSubmitConfirmOpen(false);

    const pct = (s: string) => parseFloat(s) / 100;

    const paymentFees: Record<string, number> = {
      bank_transfer: pct(bankPct),
    };
    if (allowCardInput && cardPct !== '') {
      paymentFees.card = pct(cardPct);
    }

    startTransition(async () => {
      const r = await submitBidAction({
        rfpId,
        settleCycle,
        settleLimit: parseInt(settleLimit) || 0,
        guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
        paymentFees,
        proposalAttachmentId: proposalReady ? proposal.id : undefined,
        memo: memo.trim() || undefined,
      });
      if (r.ok) {
        router.push(`/inbox/${rfpCode}/submitted`);
      } else {
        setSubmitError(r.error);
      }
    });
  };

  return (
    <>
      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={(o) => !o && setSubmitConfirmOpen(false)}
        title="제안을 제출할까요?"
        description="제출 후에는 수정할 수 없습니다."
        confirmLabel="제안 제출"
        variant="default"
        onConfirm={doSubmit}
        loading={pending}
      />
    <form className="space-y-10" onSubmit={handleSubmit}>
      {grade && grade !== 'general' && cardFeeStatutory !== null && (
        <StatutoryCardFeeNotice grade={grade} />
      )}
      {grade === undefined && (
        <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-3 space-y-1">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            [ 등급 미입력 ] 일반 가정 제안
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            구매사가 가맹점 등급을 입력하지 않은 사전 제안 RFP입니다. 카드 수수료를 직접 입력하세요.
          </p>
        </div>
      )}

      {/* 01 정산 조건 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            01 — 정산 조건
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <div className="col-span-2 space-y-1">
            <Label size="md" muted={false}>정산 주기 *</Label>
            <div className="flex items-end gap-2">
              <div className="w-28">
                <Select
                  options={CYCLE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                  value={cycleUnit}
                  onChange={(v) => setCycleUnit(v as 'D' | 'W' | 'M')}
                />
              </div>
              <input
                type="number"
                min="1"
                max="99"
                value={cycleNum}
                onChange={(e) => setCycleNum(e.target.value)}
                placeholder="1"
                className={cn(inputBase, 'flex-1')}
              />
            </div>
            <p className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
              예: D+1, W+2, M+1
            </p>
          </div>
          <KrwInput label="정산한도 (원/월)" value={settleLimit} onChange={setSettleLimit} placeholder="0" />
          <KrwInput label="월 보증보험 (원/연)" value={guaranteeInsurance} onChange={setGuaranteeInsurance} placeholder="0" />
        </div>
      </section>

      {/* 02 수수료 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            02 — 수수료
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <PctInput label="계좌이체 수수료 *" value={bankPct} onChange={setBankPct} placeholder="0.50" />
          {allowCardInput && (
            <PctInput label="카드 수수료" value={cardPct} onChange={setCardPct} placeholder="1.25" />
          )}
        </div>
      </section>

      {/* 03 제안서 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            03 — 제안서
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label size="md" muted={false}>제안서 PDF (선택)</Label>
            <input
              ref={proposalInputRef}
              type="file"
              accept=".pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadProposal(f);
                e.target.value = '';
              }}
            />
            {!proposal && (
              <button
                type="button"
                onClick={() => proposalInputRef.current?.click()}
                className="block w-full border border-dashed border-[var(--md-sys-color-outline)] py-5 text-center hover:border-[var(--md-sys-color-on-surface)] transition-colors"
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                  PDF 업로드 (클릭)
                </p>
                <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-outline)] mt-1">
                  20MB 이내
                </p>
              </button>
            )}
            {proposal && 'status' in proposal && proposal.status === 'uploading' && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-outline)]">
                {proposal.name} — UPLOADING…
              </p>
            )}
            {proposal && 'status' in proposal && proposal.status === 'error' && (
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
                  {proposal.name} — {proposal.error}
                </p>
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  className="font-mono text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] px-1"
                >
                  ×
                </button>
              </div>
            )}
            {proposalReady && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">{proposal.name}</span>
                  <button
                    type="button"
                    onClick={() => setProposal(null)}
                    className="font-mono text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] px-1 shrink-0"
                  >
                    ×
                  </button>
                </div>
                <iframe
                  src={`/api/files/${proposal.id}`}
                  title={proposal.name}
                  className="w-full h-[320px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)]"
                />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label size="md" muted={false}>메모</Label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="추가 안내 사항이 있으면 입력하세요."
              className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors resize-none"
            />
          </div>
        </div>
      </section>

      {!canSubmit && !pending && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          · 정산주기 및 계좌이체 수수료 입력 필요
        </p>
      )}

      {submitError && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
          {ERROR_LABELS[submitError] ?? submitError}
        </p>
      )}

      <Button type="submit" fullWidth size="lg" disabled={!canSubmit}>
        {pending ? '제출 중…' : '제안 제출'}
      </Button>
    </form>
    </>
  );
}
