import { z } from 'zod';

export const MAXIMUM_PRICE_VALUES = ['under_100k', '100k_300k', '300k_500k', '500k_1m', '1m_2m', '2m_5m', '5m_10m', '10m_20m', 'over_20m'] as const;
export const MAXIMUM_PRICE_LABELS: Record<(typeof MAXIMUM_PRICE_VALUES)[number], string> = {
  under_100k: '10만원 미만', '100k_300k': '10만원 이상 ~ 30만원 미만',
  '300k_500k': '30만원 이상 ~ 50만원 미만', '500k_1m': '50만원 이상 ~ 100만원 미만',
  '1m_2m': '100만원 이상 ~ 200만원 미만', '2m_5m': '200만원 이상 ~ 500만원 미만',
  '5m_10m': '500만원 이상 ~ 1,000만원 미만', '10m_20m': '1,000만원 이상 ~ 2,000만원 미만',
  over_20m: '2,000만원 이상',
};
export const SALES_METHOD_VALUES = ['preorder', 'used', 'group_buying', 'cross_border', 'subscription', 'none'] as const;
export const SALES_METHOD_LABELS: Record<(typeof SALES_METHOD_VALUES)[number], string> = {
  preorder: '예약 판매·주문 제작', used: '중고 상품', group_buying: '공동 구매',
  cross_border: '해외 상품 수입·국내 상품 수출', subscription: '구독형 판매', none: '해당 없음',
};

export const productInfoSchema = z.object({
  hasMarketplaceSellers: z.boolean().optional(),
  cashConvertible: z.boolean(),
  maximumPrice: z.enum(MAXIMUM_PRICE_VALUES),
  salesMethods: z.array(z.enum(SALES_METHOD_VALUES)).min(1).max(SALES_METHOD_VALUES.length)
    .refine(values => !values.includes('none') || values.length === 1, '해당 없음은 단독으로 선택해요')
    .transform(values => SALES_METHOD_VALUES.filter(value => values.includes(value))),
}).strict();

export type ProductInfo = z.infer<typeof productInfoSchema>;
export type ProductInfoDraft = Partial<ProductInfo>;

export function productInfoRows(info?: ProductInfo): [string, string | undefined][] {
  if (!info) return [];
  return [
    ['입점 판매자', info.hasMarketplaceSellers === undefined ? undefined : info.hasMarketplaceSellers ? '있어요' : '없어요'],
    ['환금성 상품', info.cashConvertible ? '있어요' : '없어요'],
    ['최고 상품 가격대', MAXIMUM_PRICE_LABELS[info.maximumPrice]],
    ['판매 방식', info.salesMethods.map(value => SALES_METHOD_LABELS[value]).join(', ')],
  ];
}
