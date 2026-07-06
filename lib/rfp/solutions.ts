// 현재 운영 솔루션 값·라벨 단일 출처 — 위저드 Step2 옵션·Step4 요약·요청 조건 뷰가 공유한다.
// (과거 RfpStep2Content/RfpStep4Review/RfpCreateWizard/RequestConditionsView 4곳 분산 복제를 통합)
export const SOLUTION_OPTIONS = [
  { value: 'cafe24', label: '카페24' },
  { value: 'imweb', label: '아임웹' },
  { value: 'makeshop', label: '메이크샵' },
  { value: 'godo', label: '고도몰' },
  { value: 'self', label: '자체 개발' },
  { value: 'other', label: '기타' },
] as const;

// 튜플 리터럴 타입 유지를 위해 별도 선언 (SOLUTION_OPTIONS 와 값 순서 일치 필수).
export const SOLUTION_VALUES = ['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other'] as const;

export const SOLUTION_LABELS: Record<string, string> = Object.fromEntries(
  SOLUTION_OPTIONS.map((o) => [o.value, o.label]),
);
