'use client';

import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { ProblemCard } from '@/components/landing/ProblemCard';
import { FadeInView } from '@/components/landing/FadeInView';
import { EASE_OUT } from '@/lib/landing/ease';

type Item = { num: string; title: string; desc: string };

// Problem 섹션: pin일 때 카드가 스크롤에 따라 1→2→3→4 누적 등장(i<=activeStep이면 표시),
// 폴백일 때 오늘의 FadeInView 스택. 헤딩(과 선택적 intro)은 위에 고정.
export function ScrollDrivenProblem({
  heading,
  intro,
  items,
  stagger = 0.08,
}: {
  heading: ReactNode;
  intro?: ReactNode;
  items: Item[];
  stagger?: number;
}) {
  return (
    <ScrollPinnedSection steps={items.length}>
      {({ pinned, activeStep }) => (
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-9)]">
          <div className="flex flex-col gap-[var(--s-5)]">
            {heading}
            {intro}
          </div>
          <div className="flex flex-col gap-[var(--s-4)]">
            {items.map((item, i) =>
              pinned ? (
                <motion.div
                  key={item.num}
                  animate={{ opacity: i <= activeStep ? 1 : 0, y: i <= activeStep ? 0 : 16 }}
                  transition={{ duration: 0.36, ease: EASE_OUT }}
                >
                  <ProblemCard num={item.num} title={item.title} desc={item.desc} />
                </motion.div>
              ) : (
                <FadeInView key={item.num} delay={i * stagger}>
                  <ProblemCard num={item.num} title={item.title} desc={item.desc} />
                </FadeInView>
              ),
            )}
          </div>
        </div>
      )}
    </ScrollPinnedSection>
  );
}
