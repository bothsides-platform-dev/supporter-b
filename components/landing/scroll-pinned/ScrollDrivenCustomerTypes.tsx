'use client';

import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { FadeInView } from '@/components/landing/FadeInView';
import { LANDING_TYPE } from '@/components/landing/landing-type';
import { EASE_OUT } from '@/lib/landing/ease';

type Item = { title: string; desc: string };

// 고객사 유형 리스트 — Problem 섹션과 동일한 누적 등장 동작(pin일 때 스크롤에 따라 1→2→3→4
// 카드가 쌓이고, i<=activeStep이면 표시). 이전 좌우 캐러셀(타이머 자동 전환)을 대체한다.
// 카드 비주얼은 'NN / 총개수' 카운터를 유지해 순번이 있는 유형 목록임을 드러낸다.
function CustomerTypeCard({ index, count, title, desc }: { index: number; count: number; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-[var(--s-3)] rounded-md border border-[var(--md-sys-color-outline-variant)] p-[var(--s-7)] md:p-[var(--s-8)]">
      <span className="font-mono tabular-nums text-[var(--text-md)] tracking-[-0.02em] text-[var(--md-sys-color-primary)]">
        {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
      </span>
      <h3 className={`${LANDING_TYPE.heading3} text-[var(--md-sys-color-on-surface)]`}>{title}</h3>
      <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
        {desc}
      </p>
    </div>
  );
}

export function ScrollDrivenCustomerTypes({
  heading,
  intro,
  items,
  stagger = 0.06,
}: {
  heading: ReactNode;
  intro?: ReactNode;
  items: Item[];
  stagger?: number;
}) {
  const count = items.length;
  return (
    <ScrollPinnedSection steps={count} align="start">
      {({ pinned, activeStep }) => (
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-9)]">
          <div className="flex flex-col gap-[var(--s-5)]">
            {heading}
            {intro}
          </div>
          <div className="flex flex-col gap-[var(--s-4)]">
            {items.map((item, i) => {
              const card = (
                <CustomerTypeCard index={i} count={count} title={item.title} desc={item.desc} />
              );
              return pinned ? (
                <motion.div
                  key={item.title}
                  animate={{ opacity: i <= activeStep ? 1 : 0, y: i <= activeStep ? 0 : 16 }}
                  transition={{ duration: 0.36, ease: EASE_OUT }}
                >
                  {card}
                </motion.div>
              ) : (
                <FadeInView key={item.title} delay={i * stagger}>
                  {card}
                </FadeInView>
              );
            })}
          </div>
        </div>
      )}
    </ScrollPinnedSection>
  );
}
