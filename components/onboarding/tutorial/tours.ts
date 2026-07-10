// components/onboarding/tutorial/tours.ts
// buyer 튜토리얼(BuyerTutorialFlow) 코치마크 투어 데이터. 각 phase 진입 시 1회 표시되고
// 서버에 저장되지 않는다(로컬 state로 닫힘 관리). target은 RfpCreateWizard/RfpStep4Review/
// FocusComparison/AwardCtaBar에 심어둔 data-coachmark 속성과 매칭된다.
import type { CoachmarkStep } from '@/components/onboarding/coachmarks/types';

// 튜토리얼은 입력 없이 클릭만으로 진행한다 — action step의 스포트라이트 구멍을
// 통해 사용자가 실제 버튼을 클릭하면 다음 step으로 넘어간다. 다음 버튼 앵커는
// 스텝별로 다른 target(tutorial-wizard-next-N)이라 각 스텝 도달 시 useAnchorRect가
// 새로 탐색한다(아직 없는 타깃은 MutationObserver로 등장을 기다림).
export const buyerCreateTour: CoachmarkStep[] = [
  {
    target: 'tutorial-wizard-content',
    kind: 'info',
    title: '견적 요청을 작성해요',
    placement: 'right',
    body: '실제로 사용하는 화면 그대로예요. 모든 내용이 미리 채워져 있으니, 안내를 따라 클릭만 하면 돼요.',
  },
  {
    target: 'tutorial-wizard-next-1',
    kind: 'action',
    title: '여기를 눌러 다음으로 가요',
    placement: 'top',
    body: '사업자 정보는 확인만 하면 돼요.',
  },
  {
    target: 'tutorial-wizard-next-2',
    kind: 'action',
    title: '여기를 눌러 다음으로 가요',
    placement: 'top',
    body: '요청 내용이 모두 채워져 있어요. 실제로는 여기서 우리 회사의 조건을 입력해요.',
  },
  {
    target: 'tutorial-wizard-next-3',
    kind: 'action',
    title: '여기를 눌러 다음으로 가요',
    placement: 'top',
    body: '견적 받을 PG 3사가 이미 선택돼 있어요.',
  },
  {
    target: 'tutorial-wizard-submit',
    kind: 'action',
    title: '여기를 눌러 견적 요청을 보내요',
    placement: 'top',
    body: '보내면 초대한 PG들이 견적을 보내와요.',
  },
];

export const buyerArrivalTour: CoachmarkStep[] = [
  {
    target: 'tutorial-arrival-cta',
    kind: 'action',
    title: '여기를 눌러 견적을 비교해요',
    placement: 'top',
    body: '3개 PG의 견적이 모두 도착했어요.',
  },
];

export const buyerCompareTour: CoachmarkStep[] = [
  {
    target: 'tutorial-compare-header',
    kind: 'info',
    title: '도착한 견적을 비교해요',
    placement: 'bottom',
    body: '수수료·정산조건 등을 PG별로 비교할 수 있어요.',
  },
  {
    target: 'tutorial-award-cta',
    kind: 'action',
    title: '여기를 눌러 이 견적을 선정해요',
    placement: 'top',
    body: '실제로는 충분히 비교한 뒤 마음에 드는 견적을 선정하면 돼요.',
  },
];

// pg 튜토리얼(PgTutorialFlow) 코치마크 투어 데이터. target은 InviteScene/RfpBriefPanel/
// BidWizard에 심어둔 data-coachmark 속성과 매칭된다. buyer와 동일하게 클릭-온리.
export const pgInviteTour: CoachmarkStep[] = [
  {
    target: 'tutorial-invite-cta',
    kind: 'action',
    title: '여기를 눌러 요청을 확인해요',
    placement: 'top',
    body: '구매사가 견적 요청에 초대했어요.',
  },
];

export const pgBriefTour: CoachmarkStep[] = [
  {
    target: 'tutorial-brief-panel',
    kind: 'info',
    title: '요청 조건을 확인해요',
    placement: 'right',
    body: '구매사가 보낸 견적 요청의 조건이에요.',
  },
  {
    target: 'tutorial-brief-cta',
    kind: 'action',
    title: '여기를 눌러 견적을 작성해요',
    placement: 'top',
    body: '조건을 확인했으면 견적 작성으로 넘어가요.',
  },
];

export const pgWriteTour: CoachmarkStep[] = [
  {
    target: 'tutorial-bid-form',
    kind: 'info',
    title: '견적을 작성해요',
    placement: 'right',
    body: '실제로 사용하는 화면 그대로예요. 정산조건과 수수료가 미리 채워져 있어요.',
  },
  {
    target: 'tutorial-bid-next-1',
    kind: 'action',
    title: '여기를 눌러 다음으로 가요',
    placement: 'top',
    body: '정산조건이 채워져 있어요. 확인만 하면 돼요.',
  },
  {
    target: 'tutorial-bid-next-2',
    kind: 'action',
    title: '여기를 눌러 다음으로 가요',
    placement: 'top',
    body: '결제수단별 수수료가 채워져 있어요.',
  },
  {
    target: 'tutorial-bid-next-3',
    kind: 'action',
    title: '여기를 눌러 다음으로 가요',
    placement: 'top',
    body: '견적서 PDF는 선택 사항이라 건너뛰어도 돼요.',
  },
  {
    target: 'tutorial-bid-submit',
    kind: 'action',
    title: '여기를 눌러 견적을 보내요',
    placement: 'top',
    body: '확인 창에서 한 번 더 누르면 견적이 봉인돼서 전달돼요.',
  },
];
