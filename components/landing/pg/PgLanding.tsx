'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Logo } from '@/components/primitives/Logo';
import { Footer } from '@/components/shell/Footer';
import { PgSignupCtaButton } from './PgSignupCtaButton';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const TYPING_VALUES = [
  '놓치던 입찰 기회를',
  '조건 명확한 RFP만',
  '공정한 경쟁의 자리를',
  '5분짜리 제안 작성을',
  '표준 포맷의 비교 자리를',
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

const PAIN_ITEMS = [
  {
    num: '01',
    text: '콜드콜·소개로만 영업.\n어느 잠재 고객이 진짜\n살 의향인지 모른다',
  },
  {
    num: '02',
    text: '견적서 한 번 보내고\n답이 없다. 떨어진 사유도\n알 수 없다',
  },
  {
    num: '03',
    text: '매번 다른 양식으로 견적.\n구매사는 "비교가 어렵다"는\n핑계로 결정을 미룬다',
  },
];

const HOW_STEPS = [
  {
    num: '01',
    title: '인박스로 도착',
    desc: '거래 조건이 명확한 RFP가\n인박스 알림으로 도착합니다',
  },
  {
    num: '02',
    title: '표준 포맷으로 제안',
    desc: '수수료·정산·셋업비 칸만 채우면\n5분이면 제안 완료',
  },
  {
    num: '03',
    title: '결과 통보',
    desc: '낙찰·탈락 사유까지 투명하게\n전달받습니다',
  },
];

const INBOX_PREVIEW = [
  {
    company: '주식회사 메이크샵',
    industry: '이커머스 · GMV 320억',
    feeHint: '수수료 2.0% 이하',
    received: '방금 전',
  },
  {
    company: '플레이로지스',
    industry: '물류 SaaS · GMV 80억',
    feeHint: '수수료 2.2% 이하',
    received: '12분 전',
  },
  {
    company: '주식회사 코지트래블',
    industry: '여행 · GMV 140억',
    feeHint: '수수료 1.95% 이하',
    received: '1시간 전',
  },
];

export function PgLanding({ nav }: { nav?: ReactNode }) {
  const displayText = useTypewriter(TYPING_VALUES);

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex flex-col">

      {/* ── Nav ── */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 h-[var(--shell-topbar)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
        <Logo />
        <div className="flex items-center gap-[var(--s-3)]">{nav}</div>
      </header>

      <main className="flex-1 pt-[var(--shell-topbar)]">

        {/* ── 01 / 05  Hero ── */}
        <section className="relative overflow-hidden px-8 py-[var(--s-11)] min-h-[calc(100svh-60px)] flex items-center border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
              className="font-mono text-[var(--text-xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-outline)]"
            >
              [ PG 영업담당 ]
            </motion.div>

            {/* Headline */}
            <div className="flex flex-col gap-0">
              <motion.h1
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.44, delay: 0.08, ease: EASE_OUT }}
                className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium text-[var(--md-sys-color-on-surface)]"
              >
                Supporter B로
              </motion.h1>
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.44, delay: 0.18, ease: EASE_OUT }}
                className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium flex items-baseline flex-wrap"
              >
                <span className="text-[var(--md-sys-color-primary)]">{displayText}</span>
                <span className="blink-cursor text-[var(--md-sys-color-primary)]">|</span>
                <span className="text-[var(--md-sys-color-on-surface)]">&nbsp;받아보세요.</span>
              </motion.div>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: 0.32, ease: EASE_OUT }}
              className="max-w-[640px] text-[var(--text-lg)] leading-[1.6] tracking-[-0.008em] text-[var(--md-sys-color-on-surface-variant)]"
            >
              실 구매 의향이 있는 사업자 RFP만, 조건이 정해진 상태로 인박스에 도착합니다.
              제안 한 번에 결과 통보까지 — 표준 포맷이 시간을 줄여 줍니다.
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.36, delay: 0.46, ease: EASE_OUT }}
              className="flex flex-col items-start gap-[var(--s-4)]"
            >
              <PgSignupCtaButton>입찰 알림 받기 시작 →</PgSignupCtaButton>
              <span className="font-mono text-[var(--text-2xs)] tracking-[0.06em] text-[var(--md-sys-color-outline)]">
                신용카드 불필요 — 가입 후 RFP 한 건이라도 도착하면 알림
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
                PG 영업,<br />이렇게 하고 있지 않으신가요?
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

        {/* ── 03 / 05  Inbox preview ── */}
        <section className="py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]">

            <div className="flex flex-col gap-[var(--s-4)]">
              <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.36, ease: EASE_OUT }}
                className="font-mono text-[var(--text-xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-outline)]"
              >
                — 인박스 미리보기
              </motion.span>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.36, ease: EASE_OUT }}
                className="text-[clamp(22px,3vw,40px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]"
              >
                조건이 정해진 RFP만, <br />필요한 만큼 도착합니다.
              </motion.h2>
            </div>

            <div className="flex flex-col gap-[var(--s-3)]">
              {INBOX_PREVIEW.map((item, i) => (
                <motion.div
                  key={item.company}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.32, delay: i * 0.08, ease: EASE_OUT }}
                  className="border border-[var(--md-sys-color-outline-variant)] rounded-md px-[var(--s-6)] py-[var(--s-5)] flex items-center justify-between gap-[var(--s-5)]"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[var(--text-md)] font-medium text-[var(--md-sys-color-on-surface)] truncate">
                      {item.company}
                    </span>
                    <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">
                      {item.industry}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="md-numeric text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)]">
                      {item.feeHint}
                    </span>
                    <span className="font-mono text-[var(--text-2xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                      {item.received}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

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

        {/* ── 05 / 05  Final CTA ── */}
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
                — 공정한 자리에서 경쟁
              </span>
              <h2 className="text-[clamp(26px,4.5vw,60px)] leading-[1.06] tracking-[-0.026em] font-medium text-[var(--md-sys-color-surface)]">
                다음 RFP는<br />당신의 인박스에서.
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.36, delay: 0.2, ease: EASE_OUT }}
              className="flex flex-col items-start gap-[var(--s-5)]"
            >
              <PgSignupCtaButton>입찰 알림 받기 시작 →</PgSignupCtaButton>
            </motion.div>

          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
