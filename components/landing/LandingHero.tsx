'use client';

import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useScroll, useMotionValueEvent } from 'motion/react';
import { Logo } from '@/components/primitives/Logo';
import { Button } from '@/components/primitives/Button';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { SavingsCalculator } from '@/components/landing/SavingsCalculator';
import { LiveBidSimulation } from '@/components/landing/LiveBidSimulation';
import { LandingToast, type LandingToastItem } from '@/components/landing/LandingToast';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const TYPING_VALUES = [
  '협상의 주도권을',
  '연간 수천만 원의 절감을',
  '정보 비대칭 없는 계약을',
  'PG사 간 공정한 경쟁을',
  '5분짜리 경쟁 입찰을',
];

const STEP_TOASTS: Record<1 | 2 | 3, Omit<LandingToastItem, 'id'>> = {
  1: { title: 'PG A 응답', fee: '1.95%' },
  2: { title: 'PG B 응답', fee: '2.10%' },
  3: { title: 'PG C 응답 · 최저가 🎉', fee: '1.85%', isBest: true },
};

function useTypewriter(values: string[], typingMs = 60, deletingMs = 30, holdMs = 1800): string {
  const [displayText, setDisplayText] = useState('');
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

const PAIN_ITEMS = [
  {
    num: '01',
    text: '담당 영업에게 연락해서\n"더 낮춰줄 수 있나요?"라고 물어본다',
  },
  {
    num: '02',
    text: '경쟁사가 어떤 조건을\n받는지 전혀 모른다',
  },
  {
    num: '03',
    text: '정산주기·보증금·셋업비는\n협상 대상인지도 몰랐다',
  },
];

const HOW_STEPS = [
  {
    num: '01',
    title: 'RFP 작성',
    desc: 'PG사 이메일 입력 + 거래 조건 기입\n5분이면 충분합니다',
  },
  {
    num: '02',
    title: '비교·검토',
    desc: '모든 PG 응답이 표준 포맷으로\n자동 정렬됩니다',
  },
  {
    num: '03',
    title: '낙찰·계약',
    desc: '최적 PG를 선택하고\n협상을 마무리하세요',
  },
];

export function LandingHero({ nav }: { nav?: ReactNode }) {
  const displayText = useTypewriter(TYPING_VALUES);

  // Scroll-driven simulation
  const simSectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: simSectionRef,
    offset: ['start start', 'end end'],
  });
  
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2 | 3>(0);
  const prevStepRef = useRef<0 | 1 | 2 | 3>(0);

  // Toast state
  const [toastItems, setToastItems] = useState<LandingToastItem[]>([]);
  const dismissToast = useCallback((id: string) => {
    setToastItems(prev => prev.filter(t => t.id !== id));
  }, []);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next: 0 | 1 | 2 | 3 = v < 0.25 ? 0 : v < 0.5 ? 1 : v < 0.75 ? 2 : 3;
    const prev = prevStepRef.current;
    if (next === prev) return;

    if (next > prev) {
      // Forward scroll: fire toast for each newly crossed threshold
      for (let s = prev + 1; s <= next; s++) {
        const data = STEP_TOASTS[s as 1 | 2 | 3];
        if (data) {
          setToastItems(items => [...items, { ...data, id: crypto.randomUUID() }]);
        }
      }
    }

    prevStepRef.current = next;
    setCurrentStep(next);
  });

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex flex-col">

      {/* ── Nav ── */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 h-[var(--shell-topbar)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
        <Logo />
        <div className="flex items-center gap-[var(--s-3)]">
          {nav}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 pt-[var(--shell-topbar)]">

        {/* ── 01 / 05  Hero ── */}
        <section className="relative overflow-hidden px-8 py-[var(--s-11)] min-h-[calc(100svh-60px)] flex items-center border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
            />

            {/* Headline */}
            <div className="flex flex-col gap-0">
              <motion.h1
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.44, delay: 0.08, ease: EASE_OUT }}
                className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium text-[var(--md-sys-color-on-surface)]"
              >
                Supporter B를 통해
              </motion.h1>
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.44, delay: 0.18, ease: EASE_OUT }}
                className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium flex items-baseline flex-wrap"
              >
                <span className="text-[var(--md-sys-color-primary)]">{displayText}</span>
                <span className="blink-cursor text-[var(--md-sys-color-primary)]">|</span>
                <span className="text-[var(--md-sys-color-on-surface)]">&nbsp;만듭니다.</span>
              </motion.div>
            </div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.36, delay: 0.46, ease: EASE_OUT }}
              className="flex flex-col items-start gap-[var(--s-4)]"
            >
              <Link href="/rfp/new">
                <Button size="lg">RFP 무료로 시작하기 →</Button>
              </Link>
              <span className="font-mono text-[var(--text-2xs)] tracking-[0.06em] text-[var(--md-sys-color-outline)]">
                신용카드 불필요 — 입찰 시작까지 5분
              </span>
            </motion.div>

          </div>
        </section>

        {/* ── 02 / 05  Pain ── */}
        <section className="py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]">

            <div className="flex flex-col gap-[var(--s-5)]">
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.36, ease: EASE_OUT }}
                className="text-[clamp(22px,3.2vw,42px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]"
              >
                PG 계약,<br />이렇게 하고 있지 않나요?
              </motion.h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-4)]">
              {PAIN_ITEMS.map((item, i) => (
                <motion.div
                  key={item.num}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.36, delay: i * 0.12, ease: EASE_OUT }}
                  className="border border-[var(--md-sys-color-outline-variant)] rounded-md p-[var(--s-6)]"
                >
                  <div className="flex flex-col gap-[var(--s-4)]">
                    <span className="font-mono text-[var(--text-2xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-outline)]">
                      [ {item.num} ]
                    </span>
                    <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-line">
                      {item.text}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 03 / 05  Live Bid Simulation (scroll-driven, 300vh) ── */}
        <div ref={simSectionRef} style={{ height: '300vh' }} className="relative">
          <div
            className="sticky top-[var(--shell-topbar)] border-t border-b border-[var(--md-sys-color-outline-variant)] overflow-hidden"
            style={{ height: 'calc(100svh - var(--shell-topbar))' }}
          >
            <div className="h-full py-[var(--s-9)] px-8 flex flex-col justify-center">
              <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-7)]">

                {/* Section header */}
                <div className="flex flex-col gap-[var(--s-4)]">
                  <motion.h2
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.36, ease: EASE_OUT }}
                    className="text-[clamp(22px,3vw,40px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]"
                  >
                    한 번의 요청으로, 모든 PG사 제안을 한눈에.
                  </motion.h2>


                </div>

                <LiveBidSimulation currentStep={currentStep} />

              </div>
            </div>
          </div>
        </div>

        {/* ── 04 / 05  How It Works ── */}
        <section className="py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]">

            <div className="flex flex-col gap-[var(--s-5)]">
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.36, ease: EASE_OUT }}
                className="text-[clamp(22px,3.2vw,42px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]"
              >
                세 단계면<br />충분합니다.
              </motion.h2>
            </div>

            {/* Hairline connector — desktop only */}
            <div className="hidden md:block overflow-hidden">
              <motion.div
                className="h-px bg-[var(--md-sys-color-outline)]"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                style={{ originX: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: EASE_OUT }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-7)]">
              {HOW_STEPS.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.36, delay: i * 0.12, ease: EASE_OUT }}
                  className="flex flex-col gap-[var(--s-5)]"
                >
                  <span
                    className="font-mono tabular-nums font-medium leading-none text-[var(--md-sys-color-outline)]"
                    style={{ fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '-0.02em' }}
                  >
                    {step.num}
                  </span>
                  <div className="flex flex-col gap-[var(--s-3)]">
                    <span className="font-mono text-[var(--text-xs)] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                      {step.title}
                    </span>
                    <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-line">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 05 / 05  Savings Calculator ── */}
        <section className="py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]">
            <div className="flex flex-col gap-[var(--s-5)]">
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.36, ease: EASE_OUT }}
                className="text-[clamp(22px,3.2vw,42px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]"
              >
                직접 계산해 보세요.
              </motion.h2>
            </div>
            <SavingsCalculator />
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-[var(--s-11)] px-8 bg-[var(--md-sys-color-on-surface)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
              className="flex flex-col gap-[var(--s-3)]"
            >
              <span className="font-mono text-[var(--text-xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                — 경쟁이 만드는 차이
              </span>
              <h2 className="text-[clamp(26px,4.5vw,60px)] leading-[1.06] tracking-[-0.026em] font-medium text-[var(--md-sys-color-surface)]">
                지금 바로<br />비교를 시작하세요.
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.36, delay: 0.2, ease: EASE_OUT }}
              className="flex flex-col items-start gap-[var(--s-5)]"
            >
              <Link href="/rfp/new">
                <button className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] font-mono text-[13px] tracking-[0.06em] uppercase transition-opacity duration-[140ms] hover:opacity-85 active:scale-[0.98]">
                  RFP 무료로 시작하기 →
                </button>
              </Link>
            </motion.div>

          </div>
        </section>

      </main>

      {/* Landing-scoped toast viewport */}
      <LandingToast items={toastItems} onDismiss={dismissToast} />

    </div>
  );
}
