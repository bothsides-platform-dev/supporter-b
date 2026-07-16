'use client';

// buyer 홈의 첫 견적 코치마크 — "견적 요청하기" CTA(home-create-rfp)를 가리키는
// 단일 action step. /tutorial 샌드박스와 달리 실제 CTA 클릭이 곧 진행이라 onFinish는
// completed를, 건너뛰기는 dismissed를 스탬프한다(둘 다 유저 단위 buyerFirstRfp 태스크).
import { useRef, useState } from 'react';

import { CoachmarkTour } from '@/components/onboarding/coachmarks';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import type { CoachmarkStep } from '@/components/onboarding/coachmarks';

const STEP: CoachmarkStep = {
  target: 'home-create-rfp',
  kind: 'action',
  placement: 'bottom',
  title: '견적 요청을 시작해요',
  body: '3분이면 보낼 수 있어요. 보내고 나면 여러 PG사의 견적을 한 곳에서 비교할 수 있어요.',
};

export function FirstRfpCoachmark() {
  const [dismissed, setDismissed] = useState(false);
  const stampedRef = useRef(false);

  const stamp = (event: 'completed' | 'dismissed') => {
    if (stampedRef.current) return;
    stampedRef.current = true;
    void updateOnboardingAction({ key: 'buyerFirstRfp', event }).catch(() => {});
  };

  if (dismissed) return null;

  return (
    <CoachmarkTour
      steps={[STEP]}
      onFinish={() => stamp('completed')}
      onSkip={() => {
        stamp('dismissed');
        setDismissed(true);
      }}
    />
  );
}
