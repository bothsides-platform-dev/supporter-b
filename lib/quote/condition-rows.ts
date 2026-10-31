import { bidConditions, formatCondition } from './terms';
import {
  MERCHANT_TIER_LABELS,
  PAYMENT_METHOD_LABELS,
  type Bid,
  type CustomPaymentMethod,
  type MerchantTier,
  type PaymentMethod,
} from '@/lib/types/bid';

export function bidFeeConditionRows(bid: Bid, custom: CustomPaymentMethod[] = []) {
  return Object.entries(bidConditions(bid).fees).map(([key, term]) => {
    const [method, tier] = key.split(':');
    const label =
      PAYMENT_METHOD_LABELS[method as PaymentMethod] ??
      custom.find((c) => c.id === key)?.label ??
      key;
    return {
      key,
      label: `${label}${tier ? ` (${MERCHANT_TIER_LABELS[tier as MerchantTier]})` : method === 'virtual_account' ? ' (건당)' : ''}`,
      value: formatCondition(term, method === 'virtual_account' ? '원/건' : '%'),
    };
  });
}
