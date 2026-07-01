'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';

export type DemoControlProps = {
  controlledStep?: number;
  onStepSelect?: (n: number) => void;
  scrollLocked?: boolean;
};

// Demo 섹션: pin일 때 스크롤이 데모 스텝(1→4)을 구동하고, 목업은 데모가 뷰포트에 들어오는
// 동안 1.0→1.1로 커진다(진입 연동 — 보이기 전부터 커지기 시작해 ~반쯤 보이면 다 커지고 유지).
// 데모 내부 클릭/StepBar는 onStepSelect→scrollToStep으로 연결돼 클릭·스크롤이 한 타임라인.
// 폴백일 때 오늘의 데모(자동재생+자유 클릭) 그대로.
export function ScrollDrivenDemo({
  renderDemo,
}: {
  renderDemo: (p: DemoControlProps) => ReactNode;
}) {
  return (
    <ScrollPinnedSection steps={4}>
      {({ pinned, activeStep, scrollToStep }) =>
        pinned ? (
          <PinnedDemoFrame step={activeStep} scrollToStep={scrollToStep} renderDemo={renderDemo} />
        ) : (
          renderDemo({})
        )
      }
    </ScrollPinnedSection>
  );
}

// 스케일은 스텝 진행률이 아니라 '데모의 뷰포트 진입'에 연동한다. frameRef(변환 없는 바깥
// 래퍼)로 진입 진행률을 재고, 안쪽 motion.div에만 scale을 걸어 측정↔변환 피드백 루프를 피한다.
function PinnedDemoFrame({
  step,
  scrollToStep,
  renderDemo,
}: {
  step: number;
  scrollToStep: (index: number) => void;
  renderDemo: (p: DemoControlProps) => ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  // offset: 프레임 top이 뷰포트 하단(=진입 직전, 0)부터 뷰포트 중앙(=반쯤 보임, 1)까지.
  const { scrollYProgress: enter } = useScroll({
    target: frameRef,
    offset: ['start end', 'start center'],
  });
  const scale = useTransform(enter, [0, 1], [1, 1.1]);
  return (
    <div ref={frameRef} className="mx-auto w-full max-w-[1080px]">
      <motion.div style={{ scale, willChange: 'transform' }}>
        {renderDemo({
          controlledStep: step + 1,
          onStepSelect: (n) => scrollToStep(n - 1),
          scrollLocked: true,
        })}
      </motion.div>
    </div>
  );
}
