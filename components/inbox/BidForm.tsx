'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { useBidDraft, type BidDraft } from './useBidDraft';
import { submitBidAction } from '@/lib/server/actions/bid';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import type { MerchantGrade } from '@/lib/types/biz-profile';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap(
  (c) => c.methods,
);
import {
  PercentInput,
  CurrencyInput,
  underlineInputClass,
  numericInputClass,
} from '@/components/forms/inputs';
import { cn } from '@/lib/utils';

const CYCLE_UNITS = [
  { value: 'D', label: 'D+' },
  { value: 'W', label: 'W+' },
  { value: 'M', label: 'M+' },
] as const;

const ERROR_LABELS: Record<string, string> = {
  FORBIDDEN_PG: 'PG 사용자 권한이 필요합니다.',
  FORBIDDEN: '이 견적 요청에 견적을 보낼 권한이 없어요.',
  INVALID_INPUT: '입력 값을 확인해주세요.',
  RFP_NOT_FOUND: '견적 요청을 찾을 수 없어요.',
  RFP_NOT_OPEN: '마감됐거나 이미 종료된 견적 요청이에요.',
  INVITATION_NOT_FOUND: '초대 내역을 찾을 수 없어요.',
  BID_ALREADY_SUBMITTED: '이미 견적을 보냈어요.',
  CARD_FEE_EXCEEDS_STATUTORY_CAP: '카드 수수료가 법정 상한을 초과합니다.',
  PAYMENT_METHOD_NOT_REQUESTED: '구매사가 요청하지 않은 결제수단입니다.',
};

type Props = {
  rfpId: string;
  rfpCode: string;
  grade: MerchantGrade | undefined;
  requiredPaymentMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
};

export function BidForm({
  rfpId,
  rfpCode,
  grade,
  requiredPaymentMethods,
  customPaymentMethods,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  // 정산 조건 + 수수료 — single draft-fields object (synced to useBidDraft).
  // Destructured below so read sites stay `cycleUnit`/`settleLimit`/…; writes go
  // through setField, which keeps the save-effect dependency a single value.
  const [fields, setFields] = useState<BidDraft>({
    __v: 2,
    cycleUnit: 'D',
    cycleNum: '1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    fees: {},
    memo: '',
  });
  const setField = <K extends keyof BidDraft>(key: K, value: BidDraft[K]) =>
    setFields((f) => ({ ...f, [key]: value }));
  const setFee = (key: string, value: string) =>
    setFields((f) => ({ ...f, fees: { ...f.fees, [key]: value } }));
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, fees, memo } = fields;

  // 임시 저장
  const { draft, saveDraft, clearDraft, savedAt } = useBidDraft(rfpId);
  const [showRestoreBanner, setShowRestoreBanner] = useState(draft !== null);
  const draftDismissed = useRef(false);

  useEffect(() => {
    if (!draftDismissed.current) saveDraft(fields);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRestore() {
    if (!draft) return;
    setFields(draft);
    setShowRestoreBanner(false);
  }

  function handleDismiss() {
    draftDismissed.current = true;
    clearDraft();
    setShowRestoreBanner(false);
  }

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

  // 구매사가 요청한 수단 (빈 배열 = 제한 없음 → 9종 전체). capped 등급의 card는
  // 법정 고정이라 입력칸을 만들지 않고, paymentFees에도 싣지 않는다(비교표가 등급에서 산출).
  const enumMethods = requiredPaymentMethods.length > 0 ? requiredPaymentMethods : ALL_PAYMENT_METHODS;
  const feeInputMethods = enumMethods.filter((m) => !(m === 'card' && !allowCardInput));
  const hasStatutoryCard = enumMethods.includes('card') && !allowCardInput;

  const settleCycle = `${cycleUnit}+${cycleNum || '1'}`;

  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
  const anyFeeFilled =
    hasStatutoryCard ||
    feeInputMethods.some((m) => feeFilled(m)) ||
    customPaymentMethods.some((c) => feeFilled(c.id));

  const totalFeeCount =
    (hasStatutoryCard ? 1 : 0) +
    feeInputMethods.length +
    customPaymentMethods.length;
  const filledFeeCount =
    (hasStatutoryCard ? 1 : 0) +
    feeInputMethods.filter((m) => feeFilled(m)).length +
    customPaymentMethods.filter((c) => feeFilled(c.id)).length;

  const section01Complete = parseInt(cycleNum) > 0;

  const canSubmit =
    !pending &&
    !proposalUploading &&
    cycleNum !== '' && parseInt(cycleNum) > 0 &&
    anyFeeFilled;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = () => {
    setSubmitConfirmOpen(false);

    const pct = (s: string) => parseFloat(s) / 100;

    const paymentFees: Partial<Record<PaymentMethod, number>> = {};
    for (const m of feeInputMethods) {
      const v = fees[m] ?? '';
      if (v !== '') paymentFees[m] = pct(v);
    }
    const customFees: Record<string, number> = {};
    for (const c of customPaymentMethods) {
      const v = fees[c.id] ?? '';
      if (v !== '') customFees[c.id] = pct(v);
    }

    startTransition(async () => {
      const r = await submitBidAction({
        rfpId,
        settleCycle,
        settleLimit: parseInt(settleLimit) || 0,
        guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
        paymentFees,
        customFees,
        proposalAttachmentId: proposalReady ? proposal.id : undefined,
        memo: memo.trim() || undefined,
      });
      if (r.ok) {
        clearDraft();
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
        title="견적을 보낼까요?"
        description="보낸 후에는 수정할 수 없어요."
        confirmLabel="견적 보내기"
        variant="default"
        onConfirm={doSubmit}
        loading={pending}
      />
    <form className="space-y-10" onSubmit={handleSubmit}>
      {showRestoreBanner && (
        <div className="flex items-center justify-between px-4 py-2.5 border border-[var(--md-sys-color-secondary-container)] rounded-[6px] bg-[var(--md-sys-color-secondary-container)]">
          <span className="text-[13px] text-[var(--md-sys-color-on-secondary-container)]">
            이전에 작성 중이던 내용이 있습니다
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRestore}
              className="text-[12px] text-[var(--md-sys-color-on-secondary-container)] underline underline-offset-2"
            >
              불러오기
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]"
            >
              무시
            </button>
          </div>
        </div>
      )}
      {grade === undefined && (
        <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-3 space-y-1">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            [ 등급 미입력 ] 일반 가정 견적
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            구매사가 가맹점 등급을 입력하지 않은 사전 견적 요청이에요. 카드 수수료를 직접 입력해요.
          </p>
        </div>
      )}

      {/* 01 정산 조건 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            01 — 정산 조건
          </span>
          {section01Complete && (
            <span
              data-testid="section01-complete"
              className="font-mono text-[10px] text-[var(--md-sys-color-tertiary)]"
            >
              ✓
            </span>
          )}
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
                  onChange={(v) => setField('cycleUnit', v as 'D' | 'W' | 'M')}
                />
              </div>
              <input
                type="number"
                min="1"
                max="99"
                value={cycleNum}
                onChange={(e) => setField('cycleNum', e.target.value)}
                placeholder="1"
                className={cn(numericInputClass, 'flex-1')}
              />
            </div>
            <p className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
              예: D+1, W+2, M+1
            </p>
          </div>
          <CurrencyInput label="정산한도 (원/월)" value={settleLimit} onChange={(v) => setField('settleLimit', v)} placeholder="0" />
          <CurrencyInput label="월 보증보험 (원/연)" value={guaranteeInsurance} onChange={(v) => setField('guaranteeInsurance', v)} placeholder="0" />
        </div>
      </section>

      {/* 02 수수료 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            02 — 수수료
          </span>
          <span
            data-testid="section02-count"
            className="font-mono text-[10px] text-[var(--md-sys-color-outline)]"
          >
            {filledFeeCount}/{totalFeeCount}
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          {feeInputMethods.map((m) => (
            <PercentInput
              key={m}
              label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
              value={fees[m] ?? ''}
              onChange={(v) => setFee(m, v)}
            />
          ))}
          {customPaymentMethods.map((c) => (
            <PercentInput
              key={c.id}
              label={`${c.label} 수수료`}
              value={fees[c.id] ?? ''}
              onChange={(v) => setFee(c.id, v)}
            />
          ))}
        </div>
      </section>

      {/* 03 견적서 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            03 — 견적서
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label size="md" muted={false}>견적서 PDF (선택)</Label>
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
              onChange={(e) => setField('memo', e.target.value)}
              rows={3}
              placeholder="추가 안내 사항이 있으면 입력하세요."
              className={cn(underlineInputClass, 'resize-none')}
            />
          </div>
        </div>
      </section>

      {savedAt && (
        <p className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
          저장됨 · {savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </p>
      )}

      {!canSubmit && !pending && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          · 정산주기 및 수수료 1개 이상 입력 필요
        </p>
      )}

      {submitError && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
          {ERROR_LABELS[submitError] ?? submitError}
        </p>
      )}

      <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-outline)]">
        보낸 후 수정 불가 — 한 번만 보낼 수 있어요
      </p>

      <Button type="submit" fullWidth size="lg" disabled={!canSubmit}>
        {pending ? '보내는 중…' : '견적 보내기'}
      </Button>
    </form>
    </>
  );
}
