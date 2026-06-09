'use client';

import { motion } from 'motion/react';
import { FAQ_ITEMS } from './faq-data';

export { FAQ_ITEMS };

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// 접지 않고 항상 펼친 상태로 큼직하게 노출한다.
export function FaqList() {
  return (
    <div className="flex flex-col">
      {FAQ_ITEMS.map((item, i) => (
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
