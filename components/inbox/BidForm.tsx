'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { StatutoryCardFeeNotice } from './StatutoryCardFeeNotice';
import { submitBidAction } from '@/lib/server/actions/bid';
import { STATUTORY_CARD_FEE, type CardIssuer } from '@/lib/types/bid';
import type { MerchantGrade } from '@/lib/types/biz-profile';
import type { SettlementCycle } from '@/lib/types/bid';
import { cn } from '@/lib/utils';

const CARD_ISSUERS: { key: CardIssuer; label: string }[] = [
  { key: 'BC', label: 'BC카드' },
  { key: 'SHINHAN', label: '신한카드' },
  { key: 'SAMSUNG', label: '삼성카드' },
  { key: 'HYUNDAI', label: '현대카드' },
  { key: 'KB', label: 'KB국민카드' },
  { key: 'LOTTE', label: '롯데카드' },
  { key: 'NH', label: 'NH농협카드' },
  { key: 'HANA', label: '하나카드' },
  { key: 'WOORI', label: '우리카드' },
];

const SETTLE_CYCLES: { value: SettlementCycle; label: string }[] = [
  { value: 'D+0', label: 'D+0 (당일)' },
  { value: 'D+1', label: 'D+1 (익일)' },
  { value: 'D+2', label: 'D+2 (2영업일)' },
  { value: 'weekly', label: '주 1회 정산' },
  { value: 'monthly', label: '월 1회 정산' },
];

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
  // invitationId는 prop으로 받지 않는다 — 서버 액션이 session.userId 기반으로
  // findByRfp 후 고유 invitation을 픽업한다(canAccess 가드 포함).
  grade: MerchantGrade | undefined;
};

export function BidForm({ rfpId, grade }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [settleCycle, setSettleCycle] = useState<SettlementCycle>('D+1');
  const [deposit, setDeposit] = useState('0');
  const [setupFee, setSetupFee] = useState('0');
  const [monthlyMin, setMonthlyMin] = useState('0');
  const [bankPct, setBankPct] = useState('0.50');
  const [easyPayPct, setEasyPayPct] = useState('1.50');
  const [cardFees, setCardFees] = useState<Record<CardIssuer, string>>({
    BC: '1.50', SHINHAN: '1.50', SAMSUNG: '1.50', HYUNDAI: '1.50', KB: '1.50', LOTTE: '1.50', NH: '1.50', HANA: '1.50', WOORI: '1.50',
  });
  const [overseasPct, setOverseasPct] = useState('3.00');
  const [memo, setMemo] = useState('');

  // Proposal PDF state — uploaded eagerly to /api/files/upload (Step 11)
  // so the bid action only sees the resulting attachment id. The preview
  // iframe targets /api/files/{id} which carries the user's session cookie.
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
      const r = await fetch('/api/files/upload', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      if (!r.ok) {
        setProposal({
          name: file.name,
          status: 'error',
          error:
            r.status === 413
              ? '파일이 너무 큽니다 (최대 20MB)'
              : r.status === 415
                ? '지원되지 않는 파일 형식입니다'
                : `업로드 실패 (${r.status})`,
        });
        return;
      }
      const body = (await r.json()) as { id: string; name: string; size: number };
      setProposal(body);
    } catch (err) {
      setProposal({
        name: file.name,
        status: 'error',
        error: err instanceof Error ? err.message : '네트워크 오류',
      });
    }
  };

  const proposalReady = proposal && 'id' in proposal;
  const proposalUploading = proposal && 'status' in proposal && proposal.status === 'uploading';

  // 등급 미입력 RFP 는 일반 가정 폴백 — 9개 카드사 입력 모드 활성.
  // (서버에서도 grade ∈ {null, 'general'} 일 때만 cardFeesByIssuer 채택)
  const allowCardFees = grade === undefined || grade === 'general';
  const cardFeeStatutory =
    grade && grade !== 'general' ? STATUTORY_CARD_FEE[grade] : null;

  const canSubmit =
    !pending &&
    !proposalUploading &&
    bankPct !== '' && parseFloat(bankPct) >= 0 &&
    easyPayPct !== '' && parseFloat(easyPayPct) >= 0 &&
    (!allowCardFees || CARD_ISSUERS.every((c) => cardFees[c.key] !== ''));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);

    const pct = (s: string) => parseFloat(s) / 100;

    // 영세/중소 1~3 등급은 클라이언트가 cardFeesByIssuer 생략(서버도 강제로 null
    // 처리 — advisor pin 1). 일반·등급 미입력에서만 9개 카드사 입력.
    const cardFeesByIssuer = allowCardFees
      ? (Object.fromEntries(
          CARD_ISSUERS.map((c) => [c.key, pct(cardFees[c.key])]),
        ) as Record<CardIssuer, number>)
      : undefined;

    startTransition(async () => {
      const r = await submitBidAction({
        rfpId,
        settleCycle,
        deposit: parseInt(deposit) || 0,
        setupFee: parseInt(setupFee) || 0,
        monthlyMin: parseInt(monthlyMin) || 0,
        bankTransferFeePct: pct(bankPct),
        easyPayFeePct: pct(easyPayPct),
        cardFeesByIssuer,
        overseasCardFeePct: allowCardFees && overseasPct ? pct(overseasPct) : undefined,
        proposalAttachmentId: proposalReady ? proposal.id : undefined,
        memo: memo.trim() || undefined,
      });
      if (r.ok) {
        router.push(`/inbox/${rfpId}/submitted`);
        router.refresh();
      } else {
        setSubmitError(r.error);
      }
    });
  };

  return (
    <form className="space-y-10" onSubmit={handleSubmit}>
      {/* 법정 수수료 안내 (영세/중소1~3 만). 일반·등급 미입력은 9개 카드사 입력 모드. */}
      {grade && grade !== 'general' && cardFeeStatutory !== null && (
        <StatutoryCardFeeNotice grade={grade} />
      )}
      {grade === undefined && (
        <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-3 space-y-1">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            [ 등급 미입력 ] 일반 가정 제안
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            구매사가 가맹점 등급을 입력하지 않은 사전 제안 RFP 입니다. 일반 등급 가정으로 9개 카드사별 수수료를 직접 입력해주세요.
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
            <Label size="md" muted={false}>정산 주기</Label>
            <Select
              options={SETTLE_CYCLES.map((c) => ({ value: c.value, label: c.label }))}
              value={settleCycle}
              onChange={(v) => setSettleCycle(v as SettlementCycle)}
            />
          </div>
          <KrwInput label="보증금" value={deposit} onChange={setDeposit} />
          <KrwInput label="셋업비" value={setupFee} onChange={setSetupFee} />
          <KrwInput label="월최저수수료" value={monthlyMin} onChange={setMonthlyMin} />
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
          <PctInput label="계좌이체 수수료 *" value={bankPct} onChange={setBankPct} placeholder="1.50" />
          <PctInput label="간편결제 수수료 *" value={easyPayPct} onChange={setEasyPayPct} placeholder="1.80" />
          {allowCardFees && (
            <>
              {CARD_ISSUERS.map((c) => (
                <PctInput
                  key={c.key}
                  label={`${c.label} *`}
                  value={cardFees[c.key]}
                  onChange={(v) => setCardFees((prev) => ({ ...prev, [c.key]: v }))}
                  placeholder="1.50"
                />
              ))}
              <PctInput label="해외카드 수수료" value={overseasPct} onChange={setOverseasPct} placeholder="3.00" />
            </>
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
          · 계좌이체·간편결제 수수료 입력 필요
          {allowCardFees && ' · 카드사 9개 수수료 모두 입력 필요'}
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
  );
}
