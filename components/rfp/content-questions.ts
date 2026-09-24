import type { RfpDraftStore } from '@/lib/stores/rfp-draft';
import { isAnnualPgVolumeSatisfied, isContractTypeValid, isMainProductsValid, isPaymentValid, isTitleValid, isWebsiteValid } from '@/lib/rfp/required-fields';
import { productInfoSchema } from '@/lib/rfp/product-info';
import type { PgRecommendationGroup } from '@/lib/types/pg-recommendation';

type Question = { id: string; title: string; optional?: boolean; valid: boolean };

export function contentQuestions(d: RfpDraftStore, groups: readonly PgRecommendationGroup[]): Question[] {
  const product = productInfoSchema.safeParse(d.productInfo);
  const validProductField = (field: string) => product.success || !product.error.issues.some(issue => issue.path[0] === field);
  return [
    { id: 'website', title: '어떤 홈페이지에서 판매하나요?', valid: isWebsiteValid(d.websiteUrl) },
    { id: 'solution', title: '홈페이지를 어떻게 만들었나요?', optional: true, valid: true },
    { id: 'industry', title: '어떤 업종에 해당하나요?', valid: groups.some(group => group.id === d.industryGroupId) },
    { id: 'products', title: '어떤 상품이나 서비스를 판매하나요?', valid: isMainProductsValid(d.mainProducts) },
    { id: 'sellers', title: '다른 판매자가 입점해 판매하나요?', optional: true, valid: true },
    { id: 'cash', title: '환금성 상품을 판매하나요?', valid: validProductField('cashConvertible') },
    { id: 'price', title: '가장 비싼 상품은 얼마인가요?', valid: validProductField('maximumPrice') },
    { id: 'sales', title: '어떤 방식으로 판매하나요?', valid: validProductField('salesMethods') },
    { id: 'delivery', title: '배송이나 서비스 완료까지 얼마나 걸리나요?', optional: true, valid: true },
    { id: 'contract', title: '어떤 계약을 준비하나요?', valid: isContractTypeValid(d.contractType) },
    { id: 'payment', title: '어떤 결제수단의 견적을 받을까요?', valid: isPaymentValid(d.requiredPaymentMethods, d.customPaymentMethods) },
    ...(d.contractType === 'renewal' ? [
      { id: 'annual', title: '전년도 PG 거래액은 얼마인가요?', valid: isAnnualPgVolumeSatisfied(d.annualPgVolume, d.contractType) },
      { id: 'fee', title: '현재 카드 수수료는 얼마인가요?', optional: true, valid: true },
      { id: 'limit', title: '현재 월 정산한도는 얼마인가요?', optional: true, valid: true },
      { id: 'insurance', title: '현재 보증보험 금액은 얼마인가요?', optional: true, valid: true },
      { id: 'cycle', title: '현재 정산주기는 어떻게 되나요?', optional: true, valid: true },
    ] : []),
    { id: 'title', title: '견적 요청의 제목을 정해요', valid: isTitleValid(d.title) },
    { id: 'memo', title: 'PG사에 더 전달할 내용이 있나요?', optional: true, valid: true },
    { id: 'attachments', title: '함께 보낼 자료가 있나요?', optional: true, valid: true },
  ];
}
