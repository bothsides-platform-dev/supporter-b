// components/onboarding/tutorial/tours.ts
// buyer 튜토리얼(BuyerTutorialFlow) 코치마크 투어 데이터. 각 phase 진입 시 1회 표시되고
// 서버에 저장되지 않는다(로컬 state로 닫힘 관리). target은 RfpCreateWizard/RfpStep4Review/
// FocusComparison/AwardCtaBar에 심어둔 data-coachmark 속성과 매칭된다.
import type { CoachmarkStep } from '@/components/onboarding/coachmarks/types';

export const buyerCreateTour: CoachmarkStep[] = [
  {
    target: 'tutorial-wizard-content',
    title: '견적 요청을 작성해요',
    placement: 'right',
    body: '실제로 사용하는 화면 그대로예요. 단계를 따라 입력해보세요.',
  },
];

// 제출 버튼(tutorial-wizard-submit)은 위저드 4단계(검토 화면)에만 렌더된다 —
// create 투어에 넣으면 타깃 미존재로 자동 스킵돼 버리므로, 4단계 도달 시점에
// BuyerTutorialFlow가 이 투어를 별도로 띄운다.
export const buyerSubmitTour: CoachmarkStep[] = [
  {
    target: 'tutorial-wizard-submit',
    title: '작성이 끝나면 보내요',
    placement: 'top',
    body: '내용을 확인하고 이 버튼으로 견적 요청을 보내요.',
  },
];

export const buyerCompareTour: CoachmarkStep[] = [
  {
    target: 'tutorial-compare-header',
    title: '도착한 견적을 비교해요',
    placement: 'bottom',
    body: '수수료·정산조건 등을 PG별로 비교할 수 있어요.',
  },
  {
    target: 'tutorial-award-cta',
    title: '마음에 드는 견적을 선정해요',
    placement: 'top',
    body: '이 버튼으로 원하는 PG를 최종 선정할 수 있어요.',
  },
];
