// 투어 데이터 ↔ 위저드 구조 드리프트 가드.
//
// 오프코스 리졸버의 구조적 전제는 "한 화면에 투어 action 앵커가 정확히 1개"다.
// 이 전제는 두 가지 방식으로 조용히 깨질 수 있다:
//   ① 한 투어 안에서 두 action 스텝이 같은 target을 공유 — 리졸버가 상시 "모호"로
//      판정해 무점프 no-op이 된다(에러 없음).
//   ② 위저드 스텝 수가 늘었는데 투어가 따라가지 않음 — 새 스텝의 next 앵커가
//      투어 밖 앵커가 되어 리졸버는 관망하고, 기대 타깃은 notFound로 전방 스킵돼
//      투어가 조용히 죽는다.
// 여기서 위저드 스텝 상수를 직접 가져와 정합을 못박는다.
import { describe, it, expect } from 'vitest';

import { WIZARD_STEPS } from '@/components/rfp/wizard-steps';
import { BID_WIZARD_STEPS } from '@/components/inbox/bid-wizard/bid-wizard-steps';
import {
  buyerCreateTour,
  buyerArrivalTour,
  buyerCompareTour,
  pgInviteTour,
  pgBriefTour,
  pgWriteTour,
} from '../tours';

const ALL_TOURS = {
  buyerCreateTour,
  buyerArrivalTour,
  buyerCompareTour,
  pgInviteTour,
  pgBriefTour,
  pgWriteTour,
};

function actionTargets(tour: { target: string; kind?: string }[]): string[] {
  return tour.filter((s) => s.kind === 'action').map((s) => s.target);
}

describe('tours 드리프트 가드', () => {
  it.each(Object.entries(ALL_TOURS))(
    '%s: action 스텝 target이 투어 안에서 유일하다',
    (_name, tour) => {
      const targets = actionTargets(tour);
      expect(new Set(targets).size).toBe(targets.length);
    },
  );

  it('buyerCreateTour의 action 앵커가 RfpCreateWizard 스텝 구조와 정합한다', () => {
    const stepCount = WIZARD_STEPS.length;
    const expected = [
      ...Array.from({ length: stepCount - 1 }, (_, i) => `tutorial-wizard-next-${i + 1}`),
      'tutorial-wizard-submit',
    ];
    expect(actionTargets(buyerCreateTour)).toEqual(expected);
  });

  it('pgWriteTour의 action 앵커가 BidWizard 스텝 구조와 정합한다', () => {
    const stepCount = BID_WIZARD_STEPS.length;
    const expected = [
      ...Array.from({ length: stepCount - 1 }, (_, i) => `tutorial-bid-next-${i + 1}`),
      'tutorial-bid-submit',
      // 제출 ConfirmDialog의 확인 버튼 — 마지막 action이 확인창 안까지 이어져,
      // 취소 시 리졸버가 제출 스텝으로 복귀시킨다(좌초 방지).
      'tutorial-bid-confirm',
    ];
    expect(actionTargets(pgWriteTour)).toEqual(expected);
  });
});
