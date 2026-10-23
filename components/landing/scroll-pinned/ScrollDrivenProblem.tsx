'use client';

import { Fragment, useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { ProblemCard } from '@/components/landing/ProblemCard';
import { FadeInView } from '@/components/landing/FadeInView';
import { EASE_OUT } from '@/lib/landing/ease';
import styles from './problem-story.module.css';

type Item = { num: string; title: string; desc: string };

// Problem 섹션: pin일 때 카드가 스크롤에 따라 1→2→3→4 누적 등장(i<=activeStep이면 표시),
// 폴백일 때 오늘의 FadeInView 스택. 헤딩(과 선택적 intro)은 위에 고정.
export function ScrollDrivenProblem({
  heading,
  intro,
  items,
  stagger = 0.08,
  presentation = 'stack',
}: {
  heading: ReactNode;
  intro?: ReactNode;
  items: Item[];
  stagger?: number;
  presentation?: 'stack' | 'focus';
}) {
  if (presentation === 'focus') {
    return <ProblemQuestions heading={heading} intro={intro} items={items} />;
  }
  return (
    <ScrollPinnedSection steps={items.length} align="start">
      {({ pinned, activeStep }) => (
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-9)]">
          <div className="flex flex-col gap-[var(--s-5)]">
            {/* 서버에서 전달한 lazy 노드도 고정 슬롯의 key를 유지한다. */}
            <Fragment key="heading">{heading}</Fragment>
            <Fragment key="intro">{intro}</Fragment>
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

// 질문 전체를 문서 흐름에 두어 모바일·키보드에서도 숨김 없이 읽을 수 있다.
function ProblemQuestions({ heading, intro, items }: { heading: ReactNode; intro?: ReactNode; items: Item[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start center', 'end center'] });
  const [activeStep, setActiveStep] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    setActiveStep(Math.min(items.length - 1, Math.max(0, Math.floor(progress * items.length))));
  });

  return (
    <div className={styles.story}>
      <div className={styles.heading}>
        <Fragment key="heading">{heading}</Fragment>
        <Fragment key="intro">{intro}</Fragment>
      </div>
      <div ref={listRef} className={styles.questions}>
        {items.map((item, i) => (
          <article key={item.num} className={styles.question} data-active={i === activeStep}>
            <h3>
              <button
                type="button"
                aria-current={i === activeStep ? 'step' : undefined}
                onClick={(event) => event.currentTarget.closest('article')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              >
                {item.title}
              </button>
            </h3>
            <p>{item.desc}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
