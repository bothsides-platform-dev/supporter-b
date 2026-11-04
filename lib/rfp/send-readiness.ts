// lib/rfp/send-readiness.ts
//
// 발송 가능 판정의 단일 출처. "이 견적 요청을 PG에 보내려면 무엇이 더 필요한가"를
// 미충족 목록으로 돌려준다. 위저드 단계 상태(components/rfp/wizard-validation)·
// 질문 흐름의 질문별 완료(components/rfp/content-questions)·서버 입력 스키마
// (lib/rfp/create-input)가 모두 이 목록만 소비하므로, 발송 전제가 바뀌면 아래
// 규칙표 한 곳만 고친다. 필드 단위 predicate 는 required-fields 가 그대로 소유한다.
//
// 입력은 작성 중 초안(문자열 필드)과 서버 스키마 출력(선택 필드)이 모두 구조적으로
// 만족하도록 느슨하게 둔다 — 비어 있는 문자열과 undefined 는 같은 "미입력"이다.
import { industrySelectionSchema, isIndustrySelectionValid } from '@/lib/rfp/industry-selection';
import { productInfoSchema } from '@/lib/rfp/product-info';
import { currentPgsSchema } from '@/lib/rfp/current-pgs';
import { isValidWebsiteUrlLight } from '@/lib/validation/website-url';
import {
  isContractTypeValid,
  isDeadlineValid,
  isDeliveryServicePeriodValid,
  isMainProductsValid,
  isMonthlyAvgPgVolumeSatisfied,
  isPaymentValid,
  isPgValid,
  isTitleValid,
} from '@/lib/rfp/required-fields';

export type SendReadinessInput = {
  title?: string;
  websiteUrl?: string;
  contractType?: 'new' | 'renewal' | null;
  mainProducts?: string;
  industryMode?: 'registered' | 'custom';
  industryGroupId?: string;
  customIndustryName?: string;
  monthlyAvgPgVolume?: string;
  deliveryServicePeriod?: string;
  requiredPaymentMethods: readonly unknown[];
  customPaymentMethods: readonly unknown[];
  productInfo?: unknown;
  currentPgs?: unknown;
  allowedPgWorkspaceIds: readonly unknown[];
  /** 초안은 ISO 문자열, 검증된 서버 입력은 Date. */
  deadline: string | Date;
};

export type SendReadinessRule =
  | 'title'
  | 'website-required'
  | 'website-format'
  | 'contract'
  | 'main-products'
  | 'delivery'
  | 'product-cash'
  | 'product-price'
  | 'product-sales'
  | 'industry'
  | 'current-pgs'
  | 'monthly-avg-volume'
  | 'payment'
  | 'deadline'
  | 'pg';

export type SendReadinessIssue = {
  rule: SendReadinessRule;
  /** 위저드 단계(components/rfp/wizard-steps). 2 = 견적 내용, 3 = PG 선택과 최종 확인. */
  step: 2 | 3;
  /** 질문 흐름(content-questions)의 질문 id. 단계 3 입력은 질문이 아니다. */
  questionId: string | null;
  /** 서버 입력 스키마(create-input)의 필드 경로. */
  path: string;
  message: string;
  /**
   * 묶음 화면(RfpStep2Content — 랜딩·튜토리얼)이 받지 않는 입력. 단계 게이트는
   * 이 규칙을 질문 흐름(회원 작성)에서만 적용하고, 서버 스키마는 항상 적용한다.
   */
  questionFlowOnly: boolean;
};

type ProductField = 'cashConvertible' | 'maximumPrice' | 'salesMethods';

type Context = {
  input: SendReadinessInput;
  website: string;
  productIssueAt: (field: ProductField) => boolean;
  industrySelected: boolean;
};

type Rule = SendReadinessIssue & { unmet: (ctx: Context) => boolean };

// 순서가 곧 단계 안내(hint)의 우선순위다 — 위저드가 단계별 첫 미충족 문구를 보여준다.
const RULES: readonly Rule[] = [
  { rule: 'title', step: 2, questionId: 'title', path: 'title', message: '제목을 입력해주세요', questionFlowOnly: false,
    unmet: ({ input }) => !isTitleValid(input.title ?? '') },
  { rule: 'website-required', step: 2, questionId: 'website', path: 'websiteUrl', message: '홈페이지 주소를 입력해주세요', questionFlowOnly: false,
    unmet: ({ website }) => website === '' },
  // 클라이언트 번들에서 tldts 를 제외하기 위한 경량 검사. 존재하지 않는 TLD 는 서버 스키마의
  // 필드 refine(isValidWebsiteUrl)이 따로 거부한다.
  { rule: 'website-format', step: 2, questionId: 'website', path: 'websiteUrl', message: '홈페이지 주소 형식을 확인해주세요', questionFlowOnly: false,
    unmet: ({ website }) => website !== '' && !isValidWebsiteUrlLight(website) },
  { rule: 'contract', step: 2, questionId: 'contract', path: 'contractType', message: '견적 유형을 선택해주세요', questionFlowOnly: false,
    unmet: ({ input }) => !isContractTypeValid(input.contractType) },
  { rule: 'main-products', step: 2, questionId: 'products', path: 'mainProducts', message: '주요 판매 상품을 입력해주세요', questionFlowOnly: false,
    unmet: ({ input }) => !isMainProductsValid(input.mainProducts ?? '') },
  { rule: 'delivery', step: 2, questionId: 'delivery', path: 'deliveryServicePeriod', message: '배송 및 서비스 기간을 입력해요', questionFlowOnly: false,
    unmet: ({ input }) => !isDeliveryServicePeriodValid(input.deliveryServicePeriod) },
  { rule: 'product-cash', step: 2, questionId: 'cash', path: 'productInfo', message: '환금성 상품 판매 여부를 선택해요', questionFlowOnly: true,
    unmet: ({ productIssueAt }) => productIssueAt('cashConvertible') },
  { rule: 'product-price', step: 2, questionId: 'price', path: 'productInfo', message: '가장 비싼 상품의 가격대를 선택해요', questionFlowOnly: true,
    unmet: ({ productIssueAt }) => productIssueAt('maximumPrice') },
  { rule: 'product-sales', step: 2, questionId: 'sales', path: 'productInfo', message: '판매 방식을 선택해요', questionFlowOnly: true,
    unmet: ({ productIssueAt }) => productIssueAt('salesMethods') },
  { rule: 'industry', step: 2, questionId: 'industry', path: 'industryGroupId', message: '업종을 선택해주세요', questionFlowOnly: false,
    unmet: ({ industrySelected }) => !industrySelected },
  { rule: 'current-pgs', step: 2, questionId: 'current-pgs', path: 'currentPgs', message: '현재 이용 중인 PG사를 입력해요', questionFlowOnly: true,
    unmet: ({ input }) => input.contractType === 'renewal' && !currentPgsSchema.min(1).safeParse(input.currentPgs).success },
  // 신규 계약은 전년도 PG 거래액이 존재할 수 없어 필수에서 제외한다(predicate 가 판정).
  { rule: 'monthly-avg-volume', step: 2, questionId: 'annual', path: 'monthlyAvgPgVolume', message: '전년도 월 평균 PG 거래액을 입력해주세요', questionFlowOnly: false,
    unmet: ({ input }) => !isMonthlyAvgPgVolumeSatisfied(input.monthlyAvgPgVolume ?? '', input.contractType) },
  { rule: 'payment', step: 2, questionId: 'payment', path: 'requiredPaymentMethods', message: '견적 받을 결제수단을 1개 이상 선택해주세요', questionFlowOnly: false,
    unmet: ({ input }) => !isPaymentValid(input.requiredPaymentMethods, input.customPaymentMethods) },
  { rule: 'deadline', step: 3, questionId: null, path: 'deadline', message: '마감일을 선택해주세요', questionFlowOnly: false,
    unmet: ({ input }) => (input.deadline instanceof Date ? Number.isNaN(input.deadline.getTime()) : !isDeadlineValid(input.deadline)) },
  { rule: 'pg', step: 3, questionId: null, path: 'allowedPgWorkspaceIds', message: 'PG를 1개 이상 선택해주세요', questionFlowOnly: false,
    unmet: ({ input }) => !isPgValid(input.allowedPgWorkspaceIds) },
];

function isIndustrySelected(input: SendReadinessInput, groups: readonly { id: string }[] | undefined): boolean {
  if (groups) return isIndustrySelectionValid(input, groups);
  // 등록 업종 목록을 모르는 호출자(서버 스키마)는 기존 ID/직접 입력 이름의 배타성만 본다.
  // 등록 여부는 서비스의 resolveIndustry 가 판정한다.
  return industrySelectionSchema.safeParse({
    industryGroupId: input.industryGroupId || undefined,
    customIndustryName: input.customIndustryName || undefined,
  }).success;
}

/**
 * 발송에 필요한 입력 중 아직 충족하지 못한 것을 규칙표 순서대로 돌려준다. 빈 배열이면 발송 가능하다.
 *
 * @param groups 선택 가능한 등록 업종 목록. 넘기면 선택한 ID 가 목록에 있어야 하고,
 *   넘기지 않으면 ID/직접 입력의 배타성만 본다(서버 스키마).
 */
export function sendReadinessIssues(
  input: SendReadinessInput,
  groups?: readonly { id: string }[],
): SendReadinessIssue[] {
  const product = productInfoSchema.safeParse(input.productInfo);
  const ctx: Context = {
    input,
    website: (input.websiteUrl ?? '').trim(),
    // 판매 정보 자체가 없으면(루트 이슈) 세 질문이 모두 미충족이다.
    productIssueAt: (field) =>
      !product.success && product.error.issues.some((issue) => issue.path.length === 0 || issue.path[0] === field),
    industrySelected: isIndustrySelected(input, groups),
  };
  return RULES.filter((rule) => rule.unmet(ctx)).map(({ unmet: _unmet, ...issue }) => issue);
}
