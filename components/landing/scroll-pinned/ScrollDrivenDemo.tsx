'use client';

import { type ReactNode } from 'react';
import { motion, useTransform, type MotionValue } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';

export type DemoControlProps = {
  controlledStep?: number;
  onStepSelect?: (n: number) => void;
  scrollLocked?: boolean;
};

// Demo 섹션: pin일 때 스크롤이 데모 스텝(1→4)을 구동하고 목업이 0.95→1.0으로 살짝 커진다.
// 데모 내부 클릭/StepBar는 onStepSelect→scrollToStep으로 연결돼 클릭·스크롤이 한 타임라인.
// 폴백일 때 오늘의 데모(자동재생+자유 클릭) 그대로.
export function ScrollDrivenDemo({
  renderDemo,
}: {
  renderDemo: (p: DemoControlProps) => ReactNode;
}) {
  return (
    <ScrollPinnedSection steps={4}>
      {({ pinned, activeStep, progress, scrollToStep }) =>
        pinned && progress ? (
          <PinnedDemoFrame
            progress={progress}
            step={activeStep}
            scrollToStep={scrollToStep}
            renderDemo={renderDemo}
          />
        ) : (
          renderDemo({})
        )
      }
    </ScrollPinnedSection>
  );
}

// progress→scale은 훅이라 별도 컴포넌트에서 무조건 호출(렌더-프롭 안 조건부 훅 회피).
function PinnedDemoFrame({
  progress,
  step,
  scrollToStep,
  renderDemo,
}: {
  progress: MotionValue<number>;
  step: number;
  scrollToStep: (index: number) => void;
  renderDemo: (p: DemoControlProps) => ReactNode;
}) {
  const scale = useTransform(progress, [0, 1], [0.95, 1]);
  return (
    <motion.div style={{ scale, willChange: 'transform' }} className="mx-auto w-full max-w-[1080px]">
      {renderDemo({
        controlledStep: step + 1,
        onStepSelect: (n) => scrollToStep(n - 1),
        scrollLocked: true,
      })}
    </motion.div>
  );
}
