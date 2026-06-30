'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Button } from '@/components/primitives/Button';
import { LANDING_TYPE } from '@/components/landing/landing-type';

const TYPING_VALUES = [
  '협상의 주도권을',
  '연간 수천만 원의 절감을',
  '정보 비대칭 없는 계약을',
  'PG사 간 공정한 경쟁을',
  '5분짜리 경쟁 입찰을',
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function useTypewriter(
  values: string[],
  typingMs = 60,
  deletingMs = 30,
  holdMs = 1800,
): string {
  const [displayText, setDisplayText] = useState(values[0]);
  const [index, setIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = values[index];

    if (!isDeleting && displayText === current) {
      const hold = setTimeout(() => setIsDeleting(true), holdMs);
      return () => clearTimeout(hold);
    }

    if (isDeleting && displayText === '') {
      const advance = setTimeout(() => {
        setIsDeleting(false);
        setIndex((i) => (i + 1) % values.length);
      }, 0);
      return () => clearTimeout(advance);
    }

    const speed = isDeleting ? deletingMs : typingMs;
    const next = isDeleting
      ? displayText.slice(0, -1)
      : current.slice(0, displayText.length + 1);

    const timer = setTimeout(() => setDisplayText(next), speed);
    return () => clearTimeout(timer);
  }, [displayText, index, isDeleting, values, typingMs, deletingMs, holdMs]);

  return displayText;
}

export function LandingHeroSection() {
  const displayText = useTypewriter(TYPING_VALUES);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('landing-scroll');
    return () => root.classList.remove('landing-scroll');
  }, []);

  return (
    <section className="relative overflow-hidden px-8 py-[var(--s-11)] min-h-[calc(100svh-60px)] flex items-center border-b border-[var(--md-sys-color-outline-variant)]">
      <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
        <div className="flex flex-col gap-0">
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.44, delay: 0.08, ease: EASE_OUT }}
            className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium text-[var(--md-sys-color-on-surface)] break-keep"
          >
            Supporter B를 통해
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.44, delay: 0.18, ease: EASE_OUT }}
            className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium flex items-baseline flex-wrap"
          >
            <span
              suppressHydrationWarning
              className="text-[var(--md-sys-color-primary)]"
            >
              {displayText}
            </span>
            <span className="blink-cursor text-[var(--md-sys-color-primary)]">|</span>
            <span className="text-[var(--md-sys-color-on-surface)]">&nbsp;만듭니다.</span>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.34, ease: EASE_OUT }}
          className={`max-w-[680px] ${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`}
        >
          여러 PG사의 제안을 동일한 기준으로 받아보고, 계약 조건을 표준화된 비교표로 검토하세요.
          수수료뿐 아니라 정산주기, 보증금, 셋업비까지 협상 가능한 조건으로 정리합니다.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.36, delay: 0.5, ease: EASE_OUT }}
          className="flex flex-col items-start gap-[var(--s-4)]"
        >
          <Link href="/rfp-create">
            <Button size="lg">PG 비교 견적 무료로 시작하기 →</Button>
          </Link>
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.06em] text-[var(--md-sys-color-outline)]">
            입찰 시작까지 5분 · 비공개 견적 요청
          </span>
        </motion.div>
      </div>
    </section>
  );
}
