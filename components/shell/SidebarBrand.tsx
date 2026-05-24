'use client';

import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const WORDMARK = 'Supporter B';
const EASE_DECEL = [0.05, 0.7, 0.1, 1] as const;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * 사이드바 브랜드 로고. 아이콘은 좌측 고정, 워드마크("Supporter B")는
 * 펼침/접힘 시 글자 단위 stagger로 페이드 인/아웃한다.
 * - 펼침: 왼쪽→오른쪽, 접힘: 오른쪽→왼쪽(사이드바가 오른쪽부터 좁아지는 방향과 일치)
 * - 모바일 Sheet는 collapsible 래퍼가 없어 항상 펼침으로 표시
 * - prefers-reduced-motion 시 stagger/transform 없이 즉시 표시/숨김
 */
export function SidebarBrand({ className }: { className?: string }) {
  const { state, isMobile } = useSidebar();
  const reduce = useReducedMotion();
  const expanded = isMobile || state === 'expanded';

  const container: Variants = {
    visible: {
      transition: {
        staggerChildren: reduce ? 0 : 0.02,
        staggerDirection: 1,
        delayChildren: reduce ? 0 : 0.04,
      },
    },
    hidden: {
      transition: {
        staggerChildren: reduce ? 0 : 0.02,
        staggerDirection: -1,
      },
    },
  };

  const charV: Variants = {
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0 : 0.14, ease: EASE_DECEL },
    },
    hidden: {
      opacity: 0,
      y: reduce ? 0 : '0.3em',
      transition: { duration: reduce ? 0 : 0.1, ease: EASE_OUT },
    },
  };

  return (
    <Link
      href="/home"
      aria-label="Supporter B 홈"
      className={cn(
        'group inline-flex items-center gap-3 rounded-md',
        'transition-opacity duration-[140ms] hover:opacity-70',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-on-surface)]',
        className,
      )}
    >
      {/* icon mark — bar + circle, ink on transparent (Logo default variant과 동일) */}
      <svg
        viewBox="0 0 32 32"
        width="22"
        height="22"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect x="5.5" y="5" width="4.5" height="22" rx="2.25" fill="var(--md-sys-color-on-surface)" />
        <circle cx="21" cy="16" r="9" fill="var(--md-sys-color-on-surface)" />
      </svg>
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={expanded ? 'visible' : 'hidden'}
        variants={container}
        className="inline-block whitespace-pre font-sans text-[22px] font-extrabold leading-none tracking-[-0.04em] text-[var(--md-sys-color-on-surface)]"
      >
        {WORDMARK.split('').map((ch, i) => (
          <motion.span key={i} variants={charV} className="inline-block whitespace-pre">
            {ch}
          </motion.span>
        ))}
      </motion.span>
    </Link>
  );
}
