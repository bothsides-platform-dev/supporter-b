// 온보딩 코치마크 프리미티브 공용 타입. 실제 투어 데이터(steps 배열)는
// components/onboarding/tutorial/tours.ts 가 정의하고 각 튜토리얼 플로우가 연결한다.

export type CoachmarkPlacement = 'top' | 'bottom' | 'left' | 'right';

export type CoachmarkStepKind = 'info' | 'action';

export type CoachmarkStep = {
  /** `document.querySelector('[data-coachmark="<target>"]')`로 찾을 대상 식별자 */
  target: string;
  title: string;
  body: string;
  placement: CoachmarkPlacement;
  /**
   * 'info'(기본): 클릭은 어디서나 그대로 통과하고(차단 없음) 말풍선 '다음' 버튼으로 진행.
   * 'action': 스포트라이트 구멍이 클릭-스루 — 사용자가 실제 타깃을 클릭하면 진행.
   */
  kind?: CoachmarkStepKind;
};
