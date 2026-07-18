'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { underlineInputClass } from '@/components/forms/inputs';
import { cn } from '@/lib/utils';
import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  isFlatFeeMethod,
  PAYMENT_METHOD_LABELS,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import { formatKRW } from '@/lib/utils/format';
import { Divider } from '@/components/primitives/Divider';

const ERROR_LABELS: Record<string, string> = {
  FORBIDDEN_PG: 'PG 사용자 권한이 필요합니다.',
  FORBIDDEN: '이 견적 요청에 견적을 보낼 권한이 없어요.',
  INVALID_INPUT: '입력 값을 확인해주세요.',
  RFP_NOT_FOUND: '견적 요청을 찾을 수 없어요.',
  RFP_NOT_OPEN: '마감됐거나 이미 종료된 견적 요청이에요.',
  INVITATION_NOT_FOUND: '초대 내역을 찾을 수 없어요.',
  BID_ALREADY_SUBMITTED: '이미 견적을 보냈어요.',
  PAYMENT_METHOD_NOT_REQUESTED: '구매사가 요청하지 않은 결제수단입니다.',
  INVALID_ATTACHMENT: '첨부한 견적서를 확인할 수 없어요. 다시 올려주세요.',
  LIMIT_REACHED: '템플릿은 최대 20개까지 저장할 수 있어요.',
};

type Props = {
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  signupFee: string;
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  submitError: string | null;
  onSaveTemplate: (name: string) => Promise<{ ok: boolean; error?: string }>;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 flex items-baseline justify-between gap-4">
      <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] shrink-0">{label}</span>
      <span className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface)] text-right whitespace-normal break-keep">{value}</span>
    </div>
  );
}

export function BidStepReview({
  settleCycle,
  settleLimit,
  guaranteeInsurance,
  signupFee,
  feeInputMethods,
  customPaymentMethods,
  fees,
  submitError,
  onSaveTemplate,
}: Props) {
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplError, setTplError] = useState<string | null>(null);
  const [tplSaving, setTplSaving] = useState(false);

  const feeRows: [string, string][] = [];
  for (const m of feeInputMethods) {
    if (isTieredMethod(m)) {
      const parts = MERCHANT_TIERS
        .filter((t) => (fees[`${m}:${t}`] ?? '') !== '')
        .map((t) => `${MERCHANT_TIER_LABELS[t]} ${fees[`${m}:${t}`]}%`);
      if (parts.length > 0) feeRows.push([PAYMENT_METHOD_LABELS[m], parts.join(' · ')]);
    } else if ((fees[m] ?? '') !== '') {
      // 정액(건당) 수단은 % 가 아니라 원으로 요약 표시.
      feeRows.push(
        isFlatFeeMethod(m)
          ? [`${PAYMENT_METHOD_LABELS[m]} (건당)`, formatKRW(parseInt(fees[m], 10))]
          : [PAYMENT_METHOD_LABELS[m], `${fees[m]}%`],
      );
    }
  }
  for (const c of customPaymentMethods) {
    if ((fees[c.id] ?? '') !== '') feeRows.push([c.label, `${fees[c.id]}%`]);
  }

  const handleSaveTemplate = async () => {
    const name = tplName.trim();
    if (!name) return;
    setTplError(null);
    setTplSaving(true);
    const r = await onSaveTemplate(name);
    setTplSaving(false);
    if (r.ok) {
      setTplOpen(false);
      setTplName('');
    } else {
      setTplError(r.error ?? 'INVALID_INPUT');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">보낼 견적</span>
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          <Row label="정산 주기" value={settleCycle} />
          <Row label="정산한도" value={formatKRW(parseInt(settleLimit) || 0)} />
          <Row label="월 보증보험" value={formatKRW(parseInt(guaranteeInsurance) || 0)} />
          <Row label="가입비" value={formatKRW(parseInt(signupFee) || 0)} />
          {feeRows.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <div className="rounded-[6px] border border-[var(--md-sys-color-warning)] bg-[color-mix(in_srgb,var(--md-sys-color-warning)_12%,transparent)] px-4 py-3">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface)]">
          ⚠️ 견적은 <b>한 번만</b> 보낼 수 있고, 보낸 뒤에는 수정할 수 없어요.
        </p>
      </div>

      {/* 템플릿 저장 (4단계 전용) */}
      <div className="space-y-2">
        {!tplOpen ? (
          <button
            type="button"
            onClick={() => {
              setTplError(null);
              setTplOpen(true);
            }}
            className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            템플릿으로 저장
          </button>
        ) : (
          <div className="flex items-end gap-2 border border-[var(--md-sys-color-outline-variant)] rounded-[6px] px-3 py-2.5">
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="템플릿 이름"
              maxLength={80}
              className={cn(underlineInputClass, 'flex-1')}
            />
            <Button type="button" size="sm" onClick={handleSaveTemplate} disabled={!tplName.trim() || tplSaving}>
              저장
            </Button>
            <Button type="button" size="sm" variant="text" onClick={() => { setTplOpen(false); setTplName(''); }}>
              취소
            </Button>
          </div>
        )}
        {tplError && (
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
            {ERROR_LABELS[tplError] ?? tplError}
          </p>
        )}
      </div>

      {submitError && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
          {ERROR_LABELS[submitError] ?? submitError}
        </p>
      )}

    </div>
  );
}
