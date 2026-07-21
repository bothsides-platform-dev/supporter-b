// 현재 운영 솔루션의 라벨·옵션 출처 — 위저드 Step2 옵션·Step4 요약·요청 조건 뷰가 공유한다.
// (과거 RfpStep2Content/RfpStep4Review/RfpCreateWizard/RequestConditionsView 4곳 분산 복제를 통합)
//
// 어휘(값 목록) 자체의 캐논니컬 출처는 lib/types/rfp-terms.ts 의 SOLUTION_VALUES 다 —
// zod(current-terms.ts)·서버 액션이 거기서 파생하므로, 이 파일은 라벨만 얹고 값은 재선언하지
// 않는다. 새 솔루션 추가 = rfp-terms.ts 에 값 추가 + 아래 SOLUTION_LABELS 에 라벨 추가.
import { SOLUTION_VALUES, type SolutionValue } from '@/lib/types/rfp-terms';

export { SOLUTION_VALUES };
export type { SolutionValue };

// Record<SolutionValue,_> 라 컴파일러가 전 어휘의 라벨을 강제한다 — 값만 추가하고 라벨을
// 빠뜨리면 빌드가 깨진다(조용한 무라벨 렌더 방지).
export const SOLUTION_LABELS: Record<SolutionValue, string> = {
  cafe24: '카페24',
  imweb: '아임웹',
  makeshop: '메이크샵',
  godo: '고도몰',
  self: '자체 개발',
  other: '기타',
};

// 셀렉트 옵션은 어휘 순서를 그대로 따른다(별도 순서 관리 = 드리프트 표면).
export const SOLUTION_OPTIONS: readonly { value: SolutionValue; label: string }[] =
  SOLUTION_VALUES.map((value) => ({ value, label: SOLUTION_LABELS[value] }));

/**
 * 저장된 solution 문자열 → 표시 라벨. 저장 컬럼이 free-form text 라 어휘 밖 값(구 데이터·
 * 수기 입력)이 올 수 있으므로 fail-open 한다 — 라벨을 못 찾으면 원문을 그대로 보여준다.
 */
export function solutionLabel(solution?: string | null): string | undefined {
  if (!solution) return undefined;
  return SOLUTION_LABELS[solution as SolutionValue] ?? solution;
}
