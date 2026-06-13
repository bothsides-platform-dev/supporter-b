'use client';

import { type ReactNode } from 'react';
import { motion } from 'motion/react';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface FadeInViewProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function FadeInView({ children, delay = 0, className }: FadeInViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.36, delay, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
