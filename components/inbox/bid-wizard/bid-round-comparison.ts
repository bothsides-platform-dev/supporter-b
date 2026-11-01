import { bidConditions, formatCondition } from '@/lib/quote/terms';
import { bidFeeConditionRows } from '@/lib/quote/condition-rows';
import {
  getMethodRate,
  isFlatFeeMethod,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Bid,
} from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import { formatKRW, formatPct } from '@/lib/utils/format';

export type ComparisonRow = {
  id: string;
  group: 'terms' | 'fees';
  label: string;
  before: string;
  after: string;
  delta: string;
  changed: boolean;
};

type Value = string | number | undefined | null;
type Unit = 'text' | 'money' | 'rate';
const isEmpty = (value: Value) => value == null || value === '';

function display(value: Value, unit: Unit): string {
  if (isEmpty(value)) return '—';
  if (typeof value === 'string') return value;
  return unit === 'rate' ? formatPct(value!) : formatKRW(value!);
}

function row(
  id: string,
  group: ComparisonRow['group'],
  label: string,
  before: Value,
  after: Value,
  unit: Unit,
): ComparisonRow {
  const changed = (isEmpty(before) ? undefined : before) !== (isEmpty(after) ? undefined : after);
  let delta = '같음';
  if (changed) {
    if (isEmpty(before)) delta = '추가';
    else if (isEmpty(after)) delta = '삭제';
    else if (typeof before === 'number' && typeof after === 'number') {
      const difference = after - before;
      delta = `${difference > 0 ? '+' : '−'}${
        unit === 'rate'
          ? `${(Math.abs(difference) * 100).toFixed(2)}%p`
          : formatKRW(Math.abs(difference))
      }`;
    } else delta = '변경';
  }
  return {
    id,
    group,
    label,
    before: display(before, unit),
    after: display(after, unit),
    delta,
    changed,
  };
}

/** Compare stored field identities, never display labels or expiring download URLs. */
export function compareBidRounds(rfp: RFP, before: Bid, after: Bid) {
  const rows: ComparisonRow[] = [
    row('settleCycle', 'terms', '정산 주기', before.settleCycle, after.settleCycle, 'text'),
    row('settleLimit', 'terms', '정산한도', before.settleLimit, after.settleLimit, 'money'),
    row(
      'guaranteeInsurance',
      'terms',
      '보증보험 금액(원)',
      formatCondition(bidConditions(before).guaranteeInsurance),
      formatCondition(bidConditions(after).guaranteeInsurance),
      'text',
    ),
    row(
      'signupFee',
      'terms',
      '가입비',
      before.signupFee ?? formatCondition(bidConditions(before).signupFee),
      after.signupFee ?? formatCondition(bidConditions(after).signupFee),
      'money',
    ),
  ];
  for (const method of PAYMENT_METHODS) {
    const a = before.paymentFees[method];
    const b = after.paymentFees[method];
    if (a === undefined && b === undefined) continue;
    const label = PAYMENT_METHOD_LABELS[method];
    if (!isFlatFeeMethod(method) && (typeof a === 'object' || typeof b === 'object')) {
      // Legacy scalar rates apply to every tier; an absent map entry stays absent.
      for (const tier of MERCHANT_TIERS) {
        const left = getMethodRate(a, tier);
        const right = getMethodRate(b, tier);
        if (left === undefined && right === undefined) continue;
        rows.push(
          row(
            `payment:${method}:${tier}`,
            'fees',
            `${label} · ${MERCHANT_TIER_LABELS[tier]}`,
            left,
            right,
            'rate',
          ),
        );
      }
    } else {
      rows.push(
        row(
          `payment:${method}`,
          'fees',
          isFlatFeeMethod(method) ? `${label} (건당)` : label,
          typeof a === 'number' ? a : undefined,
          typeof b === 'number' ? b : undefined,
          isFlatFeeMethod(method) ? 'money' : 'rate',
        ),
      );
    }
  }
  for (const id of new Set([...Object.keys(before.customFees), ...Object.keys(after.customFees)])) {
    rows.push(
      row(
        `custom:${id}`,
        'fees',
        rfp.customPaymentMethods?.find((method) => method.id === id)?.label ?? id,
        before.customFees[id],
        after.customFees[id],
        'rate',
      ),
    );
  }
  if (before.quoteTerms?._v === 2 || after.quoteTerms?._v === 2) {
    rows.splice(4);
    const a = new Map(bidFeeConditionRows(before, rfp.customPaymentMethods).map((r) => [r.key, r]));
    const b = new Map(bidFeeConditionRows(after, rfp.customPaymentMethods).map((r) => [r.key, r]));
    for (const key of new Set([...a.keys(), ...b.keys()]))
      rows.push(
        row(
          `payment:${key}`,
          'fees',
          (b.get(key) ?? a.get(key))!.label,
          a.get(key)?.value ?? '미입력',
          b.get(key)?.value ?? '미입력',
          'text',
        ),
      );
  }
  const beforeFiles = new Set(before.proposalPdfs.map((file) => file.id));
  const afterFiles = new Set(after.proposalPdfs.map((file) => file.id));
  return {
    rows,
    changedCount: rows.filter((item) => item.changed).length,
    memoChanged: (before.memo ?? '') !== (after.memo ?? ''),
    attachmentsChanged:
      beforeFiles.size !== afterFiles.size || [...beforeFiles].some((id) => !afterFiles.has(id)),
  };
}

export function selectBidRounds(
  bids: Bid[],
  selection?: { beforeId?: string; afterId?: string },
): {
  rounds: Bid[];
  before: Bid | undefined;
  after: Bid | undefined;
} {
  const rounds = [...bids].sort((a, b) => a.round - b.round);
  const after = rounds.slice(1).find((bid) => bid.id === selection?.afterId) ?? rounds.at(-1);
  const earlier = rounds.filter((bid) => bid.round < (after?.round ?? 0));
  const before = earlier.find((bid) => bid.id === selection?.beforeId) ?? earlier.at(-1);
  return { rounds, before, after };
}
