'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useScroll, useMotionValueEvent } from 'motion/react';

export type PinnedState = {
  /** 항상 true. 소비처 render-prop 분기 호환을 위해 유지(폴백 경로는 코드로 보존). */
  pinned: boolean;
  activeStep: number;
};

// 섹션을 스크롤 동안 화면에 고정(pin)하고, 트랙 진행률(0→1)로 이산 단계(0..steps-1)와 연속
// progress를 자식에 넘긴다. 스크롤을 가로채지 않는 sticky 방식.
// 사용자 요청으로 모바일·저감모션 포함 '항상 활성'(정적 폴백 없음) — prefers-reduced-motion을
// 존중하지 않는 의도적 예외(랜딩 한정). 폴백 렌더 자체는 소비처에 코드로 남아 있어 이 게이트만
// 되돌리면 복구된다.
export function ScrollPinnedSection({
  steps,
  stepVh = 80,
  align = 'center',
  className,
  children,
}: {
  steps: number;
  stepVh?: number;
  /** pin 콘텐츠 세로 정렬. 'start'는 화면 위쪽에 고정(누적 등장처럼 위→아래로 쌓이는 섹션용). */
  align?: 'center' | 'start';
  className?: string;
  children: (s: PinnedState) => ReactNode;
}) {
  // 방어적 가드: steps<=0은 현재 모든 호출부가 상수 배열 길이(>=4)를 넘겨 도달 불가능하지만,
  // 0으로 나눗셈/음수 clamp로 깨지는 것을 막기 위해 최소 1로 바닥을 둔다. steps>=1인 모든
  // 실사용 입력에서는 safeSteps === steps로 동작이 완전히 동일하다.
  const safeSteps = Math.max(1, steps);
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });
  const [activeStep, setActiveStep] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setActiveStep(Math.min(safeSteps - 1, Math.max(0, Math.floor(v * safeSteps))));
  });

  return (
    <div ref={trackRef} style={{ height: `${steps * stepVh}vh` }}>
      <div
        className={`sticky top-[var(--shell-topbar)] flex min-h-[calc(100svh-var(--shell-topbar))] flex-col ${align === 'start' ? 'justify-start pt-[8vh]' : 'justify-center'} ${className ?? ''}`}
      >
        {children({ pinned: true, activeStep })}
      </div>
    </div>
  );
}
