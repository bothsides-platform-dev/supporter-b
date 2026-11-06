// 견적 요청 입력 — 위저드 초안을 wire 입력으로 바꾼다. 클라이언트에서 실행된다.
//
// `schema.ts` 는 tldts 를 끌어오므로 여기서는 타입만 import 한다. 이 파일에 값 import 를
// 추가하면 클라이언트 번들이 그만큼 커진다.
import { draftIndustrySelection } from '@/lib/rfp/industry-selection';
import { productInfoSchema } from '@/lib/rfp/product-info';
import { SOLUTION_VALUES } from '@/lib/rfp/solutions';
import type { RfpDraftStore } from '@/lib/stores/rfp-draft';
import type { CreateRfpInput } from './schema';

export type RfpDraftData = Omit<RfpDraftStore, 'setField' | 'reset'>;

/** 제출 시점에만 정해지는 값. 초안 store 에는 없다. */
export type CreateRfpSubmission = {
  requestKey: string;
  /** 업로드가 끝난 첨부 id. 초안의 `rfpFiles` 는 업로드 전 메타라 그대로 보내지 않는다. */
  rfpAttachmentIds: string[];
  guestDraft?: { id: string; revision: number };
  journeyDraftId?: string;
};

type SolutionValue = (typeof SOLUTION_VALUES)[number];
const text = (value: string): string | undefined => value.trim() || undefined;

export function createRfpInputFromDraft(
  draft: RfpDraftData,
  submission: CreateRfpSubmission,
): CreateRfpInput {
  const solution = draft.currentSolution;
  const currentSolution: SolutionValue | undefined =
    solution !== '' && (SOLUTION_VALUES as readonly string[]).includes(solution)
      ? (solution as SolutionValue)
      : undefined;
  return {
    ...(submission.guestDraft ? { guestDraft: submission.guestDraft } : {}),
    ...(submission.journeyDraftId ? { journeyDraftId: submission.journeyDraftId } : {}),
    // 판매 정보는 발송 필수라 여기서 스키마로 좁힌다 — 미입력이면 throw 해 호출자가 제출을 멈춘다.
    productInfo: productInfoSchema.parse(draft.productInfo),
    title: draft.title.trim(),
    websiteUrl: text(draft.websiteUrl),
    mainProducts: text(draft.mainProducts),
    monthlyAvgPgVolume: text(draft.monthlyAvgPgVolume),
    currentFeeRate: text(draft.currentFeeRate),
    currentSettlementLimit: text(draft.currentSettlementLimit),
    currentGuaranteeInsurance: text(draft.currentGuaranteeInsurance),
    currentSettlementCycle: text(draft.currentSettlementCycle),
    deliveryServicePeriod: text(draft.deliveryServicePeriod),
    currentSolution,
    currentSolutionDetail: text(draft.currentSolutionDetail),
    memo: text(draft.memo),
    deadline: draft.deadline,
    allowedPgWorkspaceIds: draft.allowedPgWorkspaceIds.map((workspace) => workspace.id),
    rfpAttachmentIds: submission.rfpAttachmentIds,
    requiredPaymentMethods: draft.requiredPaymentMethods,
    customPaymentMethods: draft.customPaymentMethods,
    boardVisible: draft.boardVisible,
    currentFeeVisibleToPg: draft.currentFeeVisibleToPg,
    contractType: draft.contractType ?? undefined,
    // 신규 계약에는 현재 PG 가 없다 — 초안에 남은 값은 보내지 않는다.
    currentPgs: draft.contractType === 'renewal' ? draft.currentPgs : [],
    send: true,
    ...draftIndustrySelection(draft),
    requestKey: submission.requestKey,
  };
}

// ── 초안 키 분류 (드리프트 가드, 컴파일타임) ─────────────────────────────────────
// 초안 store 의 모든 키는 "wire 입력으로 전달" · "제출 값으로 전달" · "화면 상태라 제외" 중
// 정확히 하나로 분류돼야 한다. 새 초안 필드가 분류되지 않으면 빌드가 깨져, 필드가 서버에
// 조용히 안 가는 사고를 막는다. 목록은 손으로 유지한다 — 위 함수 본문과 함께 고친다.
// (`satisfies` 가 초안에서 사라진 키를, `Exclude` 가 초안에 새로 생긴 키를 잡는다.)
const _FORWARDED_DRAFT_KEYS = [
  'productInfo', 'title', 'websiteUrl', 'mainProducts', 'monthlyAvgPgVolume', 'currentFeeRate',
  'currentSettlementLimit', 'currentGuaranteeInsurance', 'currentSettlementCycle',
  'deliveryServicePeriod', 'currentSolution', 'currentSolutionDetail', 'memo', 'deadline',
  'allowedPgWorkspaceIds', 'requiredPaymentMethods', 'customPaymentMethods', 'boardVisible',
  'currentFeeVisibleToPg', 'contractType', 'currentPgs', 'industryMode', 'industryGroupId',
  'customIndustryName',
] as const satisfies readonly (keyof RfpDraftData)[];
// 제출 시점에 다른 이름으로 전달: matchingRequestKey → requestKey, rfpFiles → rfpAttachmentIds.
const _SUBMISSION_DRAFT_KEYS = ['matchingRequestKey', 'rfpFiles'] as const satisfies readonly (keyof RfpDraftData)[];
// 화면 상태 — 서버는 받지 않는다.
const _UI_ONLY_DRAFT_KEYS = ['contentQuestion', 'deadlineChoice', 'pgSelectionInitialized'] as const satisfies readonly (keyof RfpDraftData)[];
type _UnclassifiedDraftKey = Exclude<
  keyof RfpDraftData,
  | (typeof _FORWARDED_DRAFT_KEYS)[number]
  | (typeof _SUBMISSION_DRAFT_KEYS)[number]
  | (typeof _UI_ONLY_DRAFT_KEYS)[number]
>;
const _assertDraftKeysClassified: _UnclassifiedDraftKey extends never
  ? true
  : ['UNCLASSIFIED DRAFT KEY — add it to a key list in from-draft.ts', _UnclassifiedDraftKey] =
  true;
void _assertDraftKeysClassified;
