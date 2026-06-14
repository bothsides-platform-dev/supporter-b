'use client';

import { motion } from 'motion/react';
import { FAQ_ITEMS } from './faq-data';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export type FaqItem = { q: string; a: string };

// 접지 않고 항상 펼친 상태로 큼직하게 노출한다.
// items 미지정 시 buyer 기본 FAQ, 지정 시 해당 목록(예: PG 랜딩)을 렌더한다.
export function FaqList({ items = FAQ_ITEMS }: { items?: readonly FaqItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item, i) => (
        <motion.div
          key={item.q}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.36, delay: i * 0.08, ease: EASE_OUT }}
          className="flex flex-col gap-[var(--s-3)] border-t border-[var(--md-sys-color-outline-variant)] py-[var(--s-8)] first:border-t-0 first:pt-0"
        >
          <h3 className="text-[clamp(18px,2.4vw,24px)] leading-[1.3] tracking-[-0.014em] font-medium text-[var(--md-sys-color-on-surface)]">
            {item.q}
          </h3>
          <p className="text-[clamp(15px,1.8vw,18px)] leading-[1.7] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
            {item.a}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
