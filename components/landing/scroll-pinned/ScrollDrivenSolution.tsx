'use client';

import { type ReactNode } from 'react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { SolutionShowcase } from '@/components/landing/SolutionShowcase';

const TITLES = ['투명한 수수료', '도입 전 조건 확인', '추가 협의', '최적 조건 선택'];

// 스크롤·직접 선택이 같은 단계 값을 공유하며, 높이가 부족하면 직접 선택만 사용한다.
export function ScrollDrivenSolution({
  heading,
  points,
}: {
  heading: ReactNode;
  points: string[];
}) {
  return (
    <ScrollPinnedSection steps={points.length} stepVh={70} align="start" releaseOnOverflow>
      {({ activeStep, goToStep }) => (
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-9)]">
          {heading}
          <SolutionShowcase points={points.map((description, index) => ({ title: TITLES[index], description }))} activeStep={activeStep} onSelect={goToStep} />
        </div>
      )}
    </ScrollPinnedSection>
  );
}
