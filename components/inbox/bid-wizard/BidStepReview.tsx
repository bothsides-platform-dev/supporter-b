'use client';

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
import { bidSubmitErrorMessage } from './bid-wizard-errors';
import { Divider } from '@/components/primitives/Divider';
import type { ProposalState } from './BidStepProposal';


type Props = {
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  signupFee: string;
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  submitError: string | null;
  proposalChoice?: 'keep' | 'replace' | 'remove';
  previousProposal?: { id: string; name: string };
  proposal?: ProposalState;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 flex items-baseline justify-between gap-4">
      <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)] shrink-0">{label}</span>
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
  proposalChoice,
  previousProposal,
  proposal,
}: Props) {
  const feeRows: [string, string][] = [];
  for (const m of feeInputMethods) {
    if (isTieredMethod(m)) {
      const parts = MERCHANT_TIERS
        .filter((t) => (fees[`${m}:${t}`] ?? '') !== '')
        .map((t) => `${MERCHANT_TIER_LABELS[t]} ${fees[`${m}:${t}`]}%`);
      if (parts.length > 0) feeRows.push([PAYMENT_METHOD_LABELS[m], parts.join(', ')]);
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

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">보낼 견적</span>
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          <Row label="정산 주기" value={settleCycle} />
          <Row label="정산한도" value={formatKRW(parseInt(settleLimit) || 0)} />
          <Row label="월 보증보험" value={formatKRW(parseInt(guaranteeInsurance) || 0)} />
          <Row label="가입비" value={formatKRW(parseInt(signupFee) || 0)} />
          <Row label="견적서 PDF" value={proposalChoice === 'keep' && previousProposal ? previousProposal.name : proposalChoice === 'replace' && proposal && 'id' in proposal ? proposal.name : '견적서 없음'} />
          {feeRows.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <div className="rounded-[6px] border border-[var(--md-sys-color-warning)] bg-[color-mix(in_srgb,var(--md-sys-color-warning)_12%,transparent)] px-4 py-3">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface)]">
          보낸 견적은 직접 고칠 수 없어요. 구매사가 수정 요청을 보내면 새 견적을 제출할 수 있어요.
        </p>
      </div>

      {submitError && (
        <p role="alert" className="md-label-small text-[var(--md-sys-color-error)]">
          {bidSubmitErrorMessage(submitError)}
        </p>
      )}

    </div>
  );
}
