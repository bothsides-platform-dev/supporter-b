'use client';
import {
  MERCHANT_TIER_LABELS,
  PAYMENT_METHOD_LABELS,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import { draftQuoteTerms } from '@/lib/quote/draft-schema';
import { EMPTY_BID_DRAFT } from '@/lib/quote/bid-draft';
import { formatCondition } from '@/lib/quote/terms';
import { formatKRW } from '@/lib/utils/format';
import { bidSubmitErrorMessage } from './bid-wizard-errors';
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
  conditionStates?: Record<string, import('@/lib/quote/terms').ConditionState>;
  memo?: string;
  buyerName?: string;
  rfpCode?: string;
  round?: number;
  goToStep?: (step: number) => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-[16px]">
      <span className="text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
      <span className={`${/\d/.test(value) ? 'md-numeric ' : ''}break-words text-right`}>
        {value}
      </span>
    </div>
  );
}
export function BidStepReview(p: Props) {
  const terms = draftQuoteTerms(
    {
      ...EMPTY_BID_DRAFT,
      signupFee: p.signupFee,
      guaranteeInsurance: p.guaranteeInsurance,
      fees: p.fees,
      conditionStates: p.conditionStates,
    },
    p.feeInputMethods,
    p.customPaymentMethods.map((c) => c.id),
  );
  const edit = (step: number) =>
    p.goToStep && (
      <button
        type="button"
        className="min-h-9 text-[14px] text-[var(--md-sys-color-primary)] underline"
        onClick={() => p.goToStep?.(step)}
      >
        수정하기
      </button>
    );
  return (
    <div className="space-y-6">
      <div className="rounded-[6px] bg-[var(--md-sys-color-surface-container-low)] p-4">
        <p className="text-[16px] font-semibold">{p.buyerName ?? '구매사'}에게 보내는 견적</p>
        <p className="md-numeric text-[14px]">
          {p.rfpCode} · {p.round ?? 1}차 견적
        </p>
        <p className="mt-2 text-[14px]">
          입력한 조건·메모·첨부를 구매사에 전달해요. 수수료는 부가세 별도예요.
        </p>
      </div>
      <section aria-label="정산조건 검토">
        <div className="flex justify-between">
          <h3 className="text-[16px] font-semibold">정산조건</h3>
          {edit(1)}
        </div>
        <Row label="정산 주기" value={p.settleCycle} />
        <Row
          label="정산한도 (원/월)"
          value={p.settleLimit.trim() ? formatKRW(Number(p.settleLimit)) : '미입력'}
        />
        <Row label="보증보험 금액(원)" value={formatCondition(terms.guaranteeInsurance)} />
        <Row label="가입비 (원·최초 1회)" value={formatCondition(terms.signupFee)} />
      </section>
      <section aria-label="수수료 검토">
        <div className="flex justify-between">
          <h3 className="text-[16px] font-semibold">수수료 · 부가세 별도</h3>
          {edit(2)}
        </div>
        {Object.entries(terms.fees).map(([key, term]) => {
          const [method, tier] = key.split(':');
          const label =
            PAYMENT_METHOD_LABELS[method as PaymentMethod] ??
            p.customPaymentMethods.find((c) => c.id === key)?.label ??
            key;
          return (
            <Row
              key={key}
              label={`${label}${tier ? ` · ${MERCHANT_TIER_LABELS[tier as keyof typeof MERCHANT_TIER_LABELS]}` : ''}`}
              value={formatCondition(term, method === 'virtual_account' ? '원/건' : '%')}
            />
          );
        })}
      </section>
      <section aria-label="메모와 첨부 검토">
        <div className="flex justify-between">
          <h3 className="text-[16px] font-semibold">메모·견적서</h3>
          {edit(3)}
        </div>
        <p className="my-3 whitespace-pre-wrap break-words text-[16px]">
          {p.memo?.trim() || '메모 없음'}
        </p>
        <Row
          label="견적서 PDF"
          value={
            p.proposalChoice === 'keep' && p.previousProposal
              ? p.previousProposal.name
              : p.proposalChoice === 'replace' && p.proposal && 'id' in p.proposal
                ? p.proposal.name
                : '견적서 없음'
          }
        />
      </section>
      <p className="text-[14px]">
        보낸 견적은 직접 고칠 수 없어요. 구매사가 수정 요청을 보내면 새 견적을 제출할 수 있어요.
      </p>
      {p.submitError && (
        <p role="alert" className="text-[14px] text-[var(--md-sys-color-error)]">
          {bidSubmitErrorMessage(p.submitError)}
        </p>
      )}
    </div>
  );
}
