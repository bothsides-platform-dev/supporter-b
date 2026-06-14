'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';
import { cn } from '@/lib/utils';

export type CarouselItem = { title: string; desc: string };

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const AUTO_MS = 5200;

// 고객사 유형 4블록을 좌우로 전환하는 캐러셀. 이전/다음·dot 수동 조작 + 자동 전환.
// 동작 줄이기 선호 시 자동 전환은 멈추고 수동 조작만 동작한다.
export function PgCustomerCarousel({ items }: { items: CarouselItem[] }) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const go = (i: number) => setIndex((i + count) % count);

  useEffect(() => {
    if (count <= 1 || prefersReducedMotion()) return;
    const id = window.setInterval(() => setIndex((p) => (p + 1) % count), AUTO_MS);
    return () => window.clearInterval(id);
  }, [count]);

  const active = items[index];

  const arrowCls =
    'grid place-items-center h-9 w-9 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] transition-colors duration-[140ms]';

  return (
    <div className="flex flex-col gap-[var(--s-6)]">
      <div className="relative overflow-hidden min-h-[208px]">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="flex flex-col gap-[var(--s-3)] border border-[var(--md-sys-color-outline-variant)] rounded-md p-[var(--s-7)] md:p-[var(--s-8)]"
        >
          <span className="font-mono tabular-nums text-[var(--text-md)] tracking-[-0.02em] text-[var(--md-sys-color-primary)]">
            {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
          </span>
          <h3 className="text-[clamp(18px,2.6vw,26px)] font-medium leading-[1.3] tracking-[-0.014em] text-[var(--md-sys-color-on-surface)]">
            {active.title}
          </h3>
          <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
            {active.desc}
          </p>
        </motion.div>
      </div>

      <div className="flex items-center justify-between">
        {/* dots */}
        <div className="flex items-center gap-[var(--s-2)]">
          {items.map((item, i) => (
            <button
              key={item.title}
              type="button"
              aria-label={`${i + 1}번째 카드 보기`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                i === index
                  ? 'w-6 bg-[var(--md-sys-color-primary)]'
                  : 'w-1.5 bg-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-outline)]',
              )}
            />
          ))}
        </div>
        {/* prev / next */}
        <div className="flex items-center gap-[var(--s-2)]">
          <button type="button" aria-label="이전" onClick={() => go(index - 1)} className={arrowCls}>
            <ChevronLeftIcon size={18} />
          </button>
          <button type="button" aria-label="다음" onClick={() => go(index + 1)} className={arrowCls}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
