'use client';

import { Fragment, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { ProblemCard } from '@/components/landing/ProblemCard';
import { FadeInView } from '@/components/landing/FadeInView';
import { EASE_OUT } from '@/lib/landing/ease';
import styles from './problem-story.module.css';

type Item = { num: string; keyword?: string; title: string; desc: string };

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
    return (
      <ScrollPinnedSection steps={items.length} stepVh={65} className={styles.pin}>
        {({ activeStep, goToStep }) => (
          <div className={styles.story}>
            <div className={styles.heading}>
              <Fragment key="heading">{heading}</Fragment>
              <Fragment key="intro">{intro}</Fragment>
              <div className={styles.progress}>
                <div className={styles.rail} role="group" aria-label="문제로 이동">
                  {items.map((item, i) => (
                    <button type="button" key={item.num} aria-current={i === activeStep ? 'step' : undefined} onClick={() => goToStep(i)}>{item.keyword ?? item.title}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.stage}>
              {items.map((item, i) => (
                <motion.article
                  key={item.num}
                  className={styles.scene}
                  aria-hidden={i !== activeStep}
                  initial={false}
                  animate={{ opacity: i === activeStep ? 1 : 0, y: i === activeStep ? 0 : i < activeStep ? -24 : 24 }}
                  transition={{ duration: 0.32, ease: EASE_OUT }}
                >
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </motion.article>
              ))}
            </div>
          </div>
        )}
      </ScrollPinnedSection>
    );
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
