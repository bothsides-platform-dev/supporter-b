'use client';

import { useId, useState } from 'react';
import { ArrowUpRight, FileText } from 'lucide-react';
import {
  MERCHANT_TIERS, MERCHANT_TIER_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  isFlatFeeMethod, type Bid,
} from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import { formatKRW, formatPct, formatSize } from '@/lib/utils/format';
import { LocalTime } from '@/components/primitives/LocalTime';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';
import styles from './SingleBidDetail.module.css';

const money = (value: number | undefined) => value == null ? '—' : formatKRW(value);

export function SingleBidDetail({ rfp, bid, authorName, pgName }: {
  rfp: RFP; bid: Bid; authorName: string; pgName?: string;
}) {
  const id = useId();
  const [memoExpanded, setMemoExpanded] = useState(false);
  const memo = bid.memo || '—';
  const preview = Array.from(memo).slice(0, 280).join('').split('\n').slice(0, 4).join('\n');
  const longMemo = preview !== memo;
  const terms = [
    ['정산 주기', bid.settleCycle || '—'],
    ['정산한도', money(bid.settleLimit)],
    ['월 보증보험', money(bid.guaranteeInsurance)],
    ['가입비', money(bid.signupFee)],
  ];
  const feeGroups: { id: string; label: string; rates: { id: string; label: string; value: string }[] }[] = PAYMENT_METHODS.flatMap(method => {
    const fee = bid.paymentFees[method];
    if (fee === undefined) return [];
    const rates = typeof fee === 'object' && fee !== null
      ? MERCHANT_TIERS.filter(tier => fee[tier] !== undefined)
        .map(tier => ({ id: tier, label: MERCHANT_TIER_LABELS[tier], value: formatPct(fee[tier]!) }))
      : [{ id: method, label: isFlatFeeMethod(method) ? '건당' : '단일요율',
        value: isFlatFeeMethod(method) ? `${formatKRW(fee)}/건` : formatPct(fee) }];
    return [{ id: `payment:${method}`, label: PAYMENT_METHOD_LABELS[method], rates }];
  });
  for (const [customId, fee] of Object.entries(bid.customFees)) {
    feeGroups.push({
      id: `custom:${customId}`,
      label: rfp.customPaymentMethods?.find(method => method.id === customId)?.label ?? customId,
      rates: [{ id: customId, label: '요율', value: formatPct(fee) }],
    });
  }

  return <article className={styles.detail}>
    <header className={styles.header}>
      <h3><span className="md-numeric">{bid.round}</span>회차 견적</h3>
      {pgName && <p className={styles.company}>{pgName}</p>}
      <div className={styles.metadata}>
        <span>{authorName}</span>
        {bid.submittedAt && <>
          <span aria-hidden="true">·</span>
          <time dateTime={bid.submittedAt} className="md-numeric">
            <LocalTime iso={bid.submittedAt} format="yyyy.MM.dd HH:mm" />
          </time>
        </>}
      </div>
    </header>
    <section aria-labelledby={`${id}-terms`} className={styles.section}>
      <h4 id={`${id}-terms`}>정산·가입 조건</h4>
      <dl className={styles.terms}>
        {terms.map(([label, value]) => <div key={label}>
          <dt>{label}</dt><dd className="md-numeric">{value}</dd>
        </div>)}
      </dl>
    </section>
    <section aria-labelledby={`${id}-fees`} className={styles.section}>
      <h4 id={`${id}-fees`}>결제 수수료</h4>
      {feeGroups.length ? <table className={styles.fees}>
        <caption className="sr-only">결제 수수료</caption>
        <thead><tr><th scope="col">등급·과금 기준</th><th scope="col">수수료</th></tr></thead>
        {feeGroups.map(group => <tbody key={group.id} aria-label={group.label}>
          <tr className={styles.method}><th colSpan={2} scope="rowgroup">{group.label}</th></tr>
          {group.rates.length ? group.rates.map(rate => <tr key={rate.id}>
            <th scope="row">{rate.label}</th><td className="md-numeric">{rate.value}</td>
          </tr>) : <tr><th scope="row">요율</th><td>—</td></tr>}
        </tbody>)}
      </table> : <p className={styles.empty}>—</p>}
    </section>
    <section aria-labelledby={`${id}-memo`} className={styles.section}>
      <h4 id={`${id}-memo`}>메모</h4>
      <p id={`${id}-memo-content`} className={styles.memo}>{longMemo && !memoExpanded ? `${preview}…` : memo}</p>
      {longMemo && <button type="button" className={styles.memoToggle}
        aria-expanded={memoExpanded} aria-controls={`${id}-memo-content`}
        onClick={() => setMemoExpanded(!memoExpanded)}>
        {memoExpanded ? '메모 접기' : '메모 전체 보기'}
      </button>}
    </section>
    <section aria-labelledby={`${id}-files`} className={styles.section}>
      <h4 id={`${id}-files`}>첨부 <span className={`md-numeric ${styles.count}`}>{bid.proposalPdfs.length}</span></h4>
      {bid.proposalPdfs.length ? <ul className={styles.files}>
        {bid.proposalPdfs.map(file => <li key={file.id}>
          <a href={file.url} target="_blank" rel="noreferrer">
            <FileText size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className={styles.fileInfo}><span>{file.name}</span><span className={`md-numeric ${styles.fileSize}`}>{formatSize(file.size)}</span></span>
            <span className={styles.open}>열기 <ArrowUpRight size={16} aria-hidden="true" /></span>
            <span className="sr-only">{NEW_TAB_NOTICE}</span>
          </a>
        </li>)}
      </ul> : <p className={styles.empty}>—</p>}
    </section>
  </article>;
}
