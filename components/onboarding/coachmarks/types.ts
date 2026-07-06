// 온보딩 코치마크 프리미티브 공용 타입. 이 PR은 프리미티브만 제공하고 실제 투어 데이터
// (steps 배열)와 제품 화면 연결은 후속 PR에서 담당한다.

export type CoachmarkPlacement = 'top' | 'bottom' | 'left' | 'right';

export type CoachmarkStep = {
  /** `document.querySelector('[data-coachmark="<target>"]')`로 찾을 대상 식별자 */
  target: string;
  title: string;
  body: string;
  placement: CoachmarkPlacement;
};
