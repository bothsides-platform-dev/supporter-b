import { formatKRW, formatPct } from '@/lib/format';
import { STATUTORY_CARD_FEE, type Bid } from '@/lib/types/bid';
import { GRADE_LABELS, type MerchantGrade } from '@/lib/types/biz-profile';
import { SectionLabel } from './parts';

/** Read-only 6-figure bid KPI grid (settlement, fees). Shows the statutory card
 *  fee row for graded merchants, else the PG's quoted card fee. */
export function BidKpiGrid({
  bid,
  grade,
}: {
  bid: Bid;
  grade: MerchantGrade | undefined;
}) {
  const cardFee = grade ? STATUTORY_CARD_FEE[grade] : NaN;
  const showStatutoryCard = grade && grade !== 'general' && !Number.isNaN(cardFee);

  return (
    <section className="px-5 py-4 border-b border-[var(--md-sys-color-outline-variant)]">
      <SectionLabel>정형 수치</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-3">
        <Kpi label="정산주기" value={bid.settleCycle} />
        <Kpi label="정산한도" value={formatKRW(bid.settleLimit)} />
        <Kpi label="월 보증보험" value={formatKRW(bid.guaranteeInsurance)} />
        {showStatutoryCard && (
          <Kpi
            label={`카드 (${GRADE_LABELS[grade!]})`}
            value={`${(cardFee * 100).toFixed(2)}% 고정`}
            muted
          />
        )}
        {bid.paymentFees.card !== undefined && !showStatutoryCard && (
          <Kpi label="카드" value={formatPct(bid.paymentFees.card)} />
        )}
        {bid.paymentFees.overseas_card !== undefined && (
          <Kpi label="해외카드" value={formatPct(bid.paymentFees.overseas_card)} />
        )}
        {bid.paymentFees.bank_transfer !== undefined && (
          <Kpi label="계좌이체" value={formatPct(bid.paymentFees.bank_transfer)} />
        )}
        {bid.paymentFees.virtual_account !== undefined && (
          <Kpi label="가상계좌" value={formatPct(bid.paymentFees.virtual_account)} />
        )}
        {bid.paymentFees.naver_pay !== undefined && (
          <Kpi label="네이버페이" value={formatPct(bid.paymentFees.naver_pay)} />
        )}
        {bid.paymentFees.kakao_pay !== undefined && (
          <Kpi label="카카오페이" value={formatPct(bid.paymentFees.kakao_pay)} />
        )}
        {bid.paymentFees.toss_pay !== undefined && (
          <Kpi label="토스페이" value={formatPct(bid.paymentFees.toss_pay)} />
        )}
        {bid.paymentFees.mobile !== undefined && (
          <Kpi label="휴대폰결제" value={formatPct(bid.paymentFees.mobile)} />
        )}
        {bid.paymentFees.gift_card !== undefined && (
          <Kpi label="상품권" value={formatPct(bid.paymentFees.gift_card)} />
        )}
      </dl>
    </section>
  );
}

function Kpi({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </dt>
      <dd
        className={
          muted
            ? 'font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] mt-0.5'
            : 'font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)] mt-0.5'
        }
      >
        {value}
      </dd>
    </div>
  );
}
