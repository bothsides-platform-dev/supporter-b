'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Logo } from '@/components/primitives/Logo';
import { Button } from '@/components/primitives/Button';
import { CheckIcon } from '@/components/icons';
import { Footer } from '@/components/shell/Footer';
import { SavingsCalculator } from '@/components/landing/SavingsCalculator';
import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';
import { ProcessSection } from '@/components/landing/ProcessSection';
import { FaqList } from '@/components/landing/FaqList';
import { ProblemCard } from '@/components/landing/ProblemCard';
import { MetricCard } from '@/components/landing/MetricCard';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const TYPING_VALUES = [
  '협상의 주도권을',
  '연간 수천만 원의 절감을',
  '정보 비대칭 없는 계약을',
  'PG사 간 공정한 경쟁을',
  '5분짜리 경쟁 입찰을',
];

const PROBLEM_ITEMS = [
  {
    num: '01',
    title: '불투명한 수수료 체계',
    desc: '현재 매출 규모 대비 불투명한 수수료 체계로 인해 최종 계약 전까지 수수료를 알기 어렵습니다.',
  },
  {
    num: '02',
    title: '경쟁 없는 PG 견적',
    desc: '1곳의 PG사 견적만 받아 추가 협의 없이 주어진 조건대로 최종 계약을 진행하게 되어 수수료 인하가 어렵습니다.',
  },
  {
    num: '03',
    title: '최종 도입 전까지 승인 결과 불투명',
    desc: 'PG사 리스크팀 및 카드사 심사 전까지 최종 승인 가능 여부를 알기 어렵습니다.',
  },
  {
    num: '04',
    title: '수수료 이외 조건 협의 불가',
    desc: '정산주기, 보증보험, 가입비 등 주요 조건을 충분히 협의하지 못한 채 계약이 진행됩니다.',
  },
];

const SOLUTION_POINTS = [
  '고객사의 조건에 맞는 투명한 수수료 견적을 다수의 PG사에게 받을 수 있습니다.',
  '최종 도입 전에도 PG사 리스크팀 검토, 카드사 승인, 정산주기, 보증보험, 가입비 등의 조건을 비교할 수 있습니다.',
  '여러 PG사의 견적을 비교한 뒤 추가 협의를 진행할 수 있습니다.',
  '견적 비교와 협상 과정을 단순화하여 더 빠르게 최적 조건을 찾을 수 있습니다.',
];

const METRICS = [
  { to: 0.89, decimals: 2, unit: '%', qualifier: '절감', caption: 'PoC 고객사 평균 수수료 절감 비율' },
  { to: 4.5, decimals: 1, unit: '주', qualifier: '감소', caption: 'PG사 견적 비교 시 소요 시간 감소' },
  { to: 2300, decimals: 0, unit: '만원', qualifier: undefined, caption: 'PoC 고객사 연간 평균 수수료 절감액' },
];

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

const sectionCls =
  'py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)] scroll-mt-[var(--shell-topbar)]';
const containerCls = 'mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]';
const h2Cls =
  'text-[clamp(22px,3.2vw,42px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]';

function SectionHeading({ children }: { children: ReactNode }) {
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

export function LandingHero({ nav }: { nav?: ReactNode }) {
  const displayText = useTypewriter(TYPING_VALUES);

  // 랜딩에서만 인페이지 앵커 스크롤을 부드럽게 한다. 앱(목록 키보드 이동·채팅
  // 스크롤)은 즉시 스크롤을 유지해야 하므로 전역 대신 <html> 클래스로 스코프.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('landing-scroll');
    return () => root.classList.remove('landing-scroll');
  }, []);

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex flex-col">

      {/* ── Nav ── */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 h-[var(--shell-topbar)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
        <Logo />
        <div className="flex items-center gap-[var(--s-3)]">{nav}</div>
      </header>

      <main className="flex-1 pt-[var(--shell-topbar)]">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden px-8 py-[var(--s-11)] min-h-[calc(100svh-60px)] flex items-center border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
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

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.36, delay: 0.46, ease: EASE_OUT }}
              className="flex flex-col items-start gap-[var(--s-4)]"
            >
              <Link href="/login">
                <Button size="lg">PG 비교 견적 무료로 시작하기 →</Button>
              </Link>
              <span className="font-mono text-[var(--text-2xs)] tracking-[0.06em] text-[var(--md-sys-color-outline)]">
                신용카드 불필요 — 입찰 시작까지 5분
              </span>
            </motion.div>
          </div>
        </section>

        {/* ── Problem ── */}
        <section className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>기존 PG 계약을 하면서<br />이런 불편함을 겪지 않으셨나요?</SectionHeading>
            <div className="flex flex-col gap-[var(--s-4)]">
              {PROBLEM_ITEMS.map((item, i) => (
                <motion.div
                  key={item.num}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.36, delay: i * 0.08, ease: EASE_OUT }}
                >
                  <ProblemCard num={item.num} title={item.title} desc={item.desc} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Solution ── */}
        <section id="service" className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>SupporterB를 통해<br />PG 도입 문제를 해결해보세요</SectionHeading>
            <ul className="flex flex-col gap-[var(--s-5)]">
              {SOLUTION_POINTS.map((point, i) => (
                <motion.li
                  key={point}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.36, delay: i * 0.08, ease: EASE_OUT }}
                  className="flex items-start gap-[var(--s-4)]"
                >
                  <span className="mt-0.5 shrink-0 grid place-items-center h-5 w-5 rounded-full bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)]">
                    <CheckIcon size={13} />
                  </span>
                  <span className="text-[var(--text-md)] leading-[1.6] tracking-[-0.006em] text-[var(--md-sys-color-on-surface)]">
                    {point}
                  </span>
                </motion.li>
              ))}
            </ul>
            <OfferComparisonTable />
          </div>
        </section>

        {/* ── Process (제목 없이 프로세스만 노출) ── */}
        <section id="process" className={sectionCls}>
          <div className={containerCls}>
            <ProcessSection />
          </div>
        </section>

        {/* ── Metrics ── */}
        <section className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>
              SupporterB를 통해 협상 비용을 절감하고<br />사업의 본질에 집중하세요.
            </SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--s-8)]">
              {METRICS.map((m) => (
                <MetricCard
                  key={m.caption}
                  to={m.to}
                  decimals={m.decimals}
                  unit={m.unit}
                  qualifier={m.qualifier}
                  caption={m.caption}
                />
              ))}
            </div>
          </div>
        </section>

        {/* TODO(landing): 레퍼런스 + 파트너사 섹션은 의도적으로 미노출. 자료 확보 후 Metrics와 Pricing 사이에 추가 예정. */}

        {/* ── Pricing ── */}
        <section id="pricing" className={sectionCls}>
          <div className={`${containerCls} gap-[var(--s-6)]`}>
            <SectionHeading>이용 요금</SectionHeading>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              className="flex flex-col gap-[var(--s-4)]"
            >
              <p className="text-[clamp(18px,2.2vw,24px)] leading-[1.5] tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
                SupporterB는 현재(2026년) 무료로 이용 가능합니다.
              </p>
              <p className="text-[var(--text-md)] leading-[1.68] text-[var(--md-sys-color-on-surface-variant)]">
                추후 유료로 전환될 수 있으며, 전환 2달 전 사전 공유 예정입니다.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── Calculator ── */}
        <section id="calculator" className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>직접 계산해 보세요.</SectionHeading>
            <SavingsCalculator />
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className={sectionCls}>
          <div className="mx-auto w-full max-w-[760px] flex flex-col gap-[var(--s-9)]">
            <SectionHeading>자주 묻는 질문</SectionHeading>
            <FaqList />
          </div>
        </section>

        {/* ── Final CTA / 도입문의 ── */}
        <section id="contact" className="py-[var(--s-11)] px-8 bg-[var(--md-sys-color-on-surface)] scroll-mt-[var(--shell-topbar)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
              className="flex flex-col gap-[var(--s-3)]"
            >
              <span className="font-mono text-[var(--text-xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                — 도입문의
              </span>
              <h2 className="text-[clamp(24px,4vw,52px)] leading-[1.12] tracking-[-0.024em] font-medium text-[var(--md-sys-color-surface)]">
                지금 바로 불필요한 비용은 줄이고,<br />사업의 본질에 집중하세요.
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.36, delay: 0.2, ease: EASE_OUT }}
              className="flex flex-col items-start gap-[var(--s-5)]"
            >
              <Link href="/login">
                <button className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] font-mono text-[13px] tracking-[0.06em] uppercase transition-opacity duration-[140ms] hover:opacity-85 active:scale-[0.98]">
                  PG견적 무료로 받기 →
                </button>
              </Link>
            </motion.div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
