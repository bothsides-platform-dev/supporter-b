'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const h2Cls =
  'text-[clamp(22px,3.2vw,42px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]';

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <motion.h2
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.36, ease: EASE_OUT }}
      className={h2Cls}
    >
      {children}
    </motion.h2>
  );
}
