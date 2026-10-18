import { currentPgsSchema } from '@/lib/rfp/current-pgs';
import { isIndustrySelectionValid } from '@/lib/rfp/industry-selection';
import type { RfpDraftStore } from '@/lib/stores/rfp-draft';
import { isDeliveryServicePeriodValid, isAnnualPgVolumeSatisfied, isContractTypeValid, isMainProductsValid, isPaymentValid, isTitleValid, isWebsiteValid } from '@/lib/rfp/required-fields';
import { productInfoSchema } from '@/lib/rfp/product-info';
import type { PublicIndustry } from '@/lib/types/pg-recommendation';

type Question = { id: string; title: string; valid: boolean; section: string; optional: boolean };

export function contentQuestions(d: RfpDraftStore, groups: readonly PublicIndustry[]): Question[] {
  const product = productInfoSchema.safeParse(d.productInfo);
  const validProductField = (field: string) => product.success || !product.error.issues.some(issue => issue.path[0] === field);
  return [
    { id: 'website', section: '홈페이지', optional: false, title: '어떤 홈페이지에서 판매하나요?', valid: isWebsiteValid(d.websiteUrl) },
    { id: 'solution', section: '홈페이지', optional: true, title: '홈페이지를 어떻게 만들었나요?', valid: true },
    { id: 'industry', section: '판매 정보', optional: false, title: '어떤 업종에 해당하나요?', valid: isIndustrySelectionValid(d, groups) },
    { id: 'products', section: '판매 정보', optional: false, title: '어떤 상품이나 서비스를 판매하나요?', valid: isMainProductsValid(d.mainProducts) },
    { id: 'sellers', section: '판매 정보', optional: true, title: '다른 판매자가 입점해 판매하나요?', valid: true },
    { id: 'cash', section: '판매 정보', optional: false, title: '환금성 상품을 판매하나요?', valid: validProductField('cashConvertible') },
    { id: 'price', section: '판매 정보', optional: false, title: '가장 비싼 상품은 얼마인가요?', valid: validProductField('maximumPrice') },
    { id: 'sales', section: '판매 정보', optional: false, title: '어떤 방식으로 판매하나요?', valid: validProductField('salesMethods') },
    { id: 'delivery', section: '판매 정보', optional: false, title: '배송이나 서비스 완료까지 얼마나 걸리나요?', valid: isDeliveryServicePeriodValid(d.deliveryServicePeriod) },
    { id: 'contract', section: '계약 조건', optional: false, title: '어떤 계약을 준비하나요?', valid: isContractTypeValid(d.contractType) },
    ...(d.contractType === 'renewal' ? [{ id: 'current-pgs', section: '계약 조건', optional: false, title: '현재 이용 중인 PG사는 어디인가요?', valid: currentPgsSchema.min(1).safeParse(d.currentPgs).success }] : []),
    { id: 'payment', section: '계약 조건', optional: false, title: '어떤 결제수단의 견적을 받을까요?', valid: isPaymentValid(d.requiredPaymentMethods, d.customPaymentMethods) },
    ...(d.contractType === 'renewal' ? [
      { id: 'annual', section: '계약 조건', optional: false, title: '전년도 PG 거래액은 얼마인가요?', valid: isAnnualPgVolumeSatisfied(d.annualPgVolume, d.contractType) },
      { id: 'fee', section: '계약 조건', optional: true, title: '현재 카드 수수료는 얼마인가요?', valid: true },
      { id: 'limit', section: '계약 조건', optional: true, title: '현재 월 정산한도는 얼마인가요?', valid: true },
      { id: 'insurance', section: '계약 조건', optional: true, title: '현재 보증보험 금액은 얼마인가요?', valid: true },
      { id: 'cycle', section: '계약 조건', optional: true, title: '현재 정산주기는 어떻게 되나요?', valid: true },
    ] : []),
    { id: 'title', section: '마무리', optional: false, title: '견적 요청의 제목을 정해요', valid: isTitleValid(d.title) },
    { id: 'memo', section: '마무리', optional: true, title: 'PG사에 더 전달할 내용이 있나요?', valid: true },
    { id: 'attachments', section: '마무리', optional: true, title: '함께 보낼 자료가 있나요?', valid: true },
  ];
}
