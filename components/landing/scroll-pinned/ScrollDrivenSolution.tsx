'use client';

import { type ReactNode } from 'react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { SolutionShowcase } from '@/components/landing/SolutionShowcase';

// Solution 섹션(구매사 전용): 서버 컴포넌트가 render-prop 함수를 클라 경계로 넘길 수 없으므로
// pin 배선을 이 클라이언트 래퍼가 소유한다. 헤딩은 고정한 채 스크롤로 SolutionShowcase의
// activeStep(0..points-1)을 구동하고, 폴백(모바일·reduced-motion)일 땐 activeStep=null(평평).
export function ScrollDrivenSolution({
  heading,
  points,
}: {
  heading: ReactNode;
  points: string[];
}) {
  return (
    <ScrollPinnedSection steps={points.length} align="start">
      {({ pinned, activeStep }) => (
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-9)]">
          {heading}
          <SolutionShowcase points={points} activeStep={pinned ? activeStep : null} />
        </div>
      )}
    </ScrollPinnedSection>
  );
}
