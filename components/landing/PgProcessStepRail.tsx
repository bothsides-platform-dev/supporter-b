'use client';

import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT } from '@/lib/landing/ease';
import { pgDemoPageToStepIndex } from '@/components/landing/demo-app/pg-process-sync';

export type ProcessStep = {
  n: string;
  title: string;
  body: string;
  note: string;
};

// 데모 창 위에 얹는 참여 프로세스 스테퍼 — 5스텝을 가로 진행바로 보여주고, 현재 데모 페이지에
// 맞춰 활성 스텝을 강조한다. 상세 카드는 활성 스텝의 본문·보조문구를 크로스페이드로 갱신한다
// (제목은 활성 노드가 이미 강조하므로 카드에선 반복하지 않는다). 페이지↔스텝 매핑은
// pgDemoPageToStepIndex 단일 출처.
function StepNode({ step, state }: { step: ProcessStep; state: 'done' | 'active' | 'upcoming' }) {
  const barCls =
    state === 'active'
      ? 'bg-[var(--md-sys-color-primary)]'
      : state === 'done'
        ? 'bg-[var(--md-sys-color-primary)] opacity-50'
        : 'bg-[var(--md-sys-color-outline-variant)]';
  const numCls =
    state === 'upcoming'
      ? 'text-[var(--md-sys-color-on-surface-variant)]'
      : 'text-[var(--md-sys-color-primary)]';
  // done·upcoming 제목은 한 톤으로 모인다 — 단계 상태는 위쪽 도트 색이 구분한다.
  const titleCls =
    state === 'active'
      ? 'text-[var(--md-sys-color-on-surface)] font-medium'
      : 'text-[var(--md-sys-color-on-surface-variant)]';
  return (
    <li
      aria-current={state === 'active' ? 'step' : undefined}
      data-state={state}
      className="flex min-w-0 flex-col gap-[var(--s-2)]"
    >
      <span className={`h-[3px] w-full rounded-full transition-colors duration-300 ${barCls}`} />
      <div className="flex items-baseline gap-[var(--s-2)]">
        <span className={`font-mono tabular-nums text-[13px] tracking-[-0.02em] ${numCls}`}>
          {step.n}
        </span>
        <span className={`hidden truncate text-[13px] tracking-[-0.006em] sm:inline ${titleCls}`}>
          {step.title}
        </span>
      </div>
    </li>
  );
}

export function PgProcessStepRail({
  steps,
  page,
}: {
  steps: readonly ProcessStep[];
  page: number;
}) {
  const activeIndex = pgDemoPageToStepIndex(page);
  const active = steps[activeIndex] ?? steps[0];

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      <ol
        className="grid gap-[var(--s-2)]"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => (
          <StepNode
            key={step.n}
            step={step}
            state={i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming'}
          />
        ))}
      </ol>

      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="flex flex-col gap-[var(--s-2)] rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-[var(--s-6)]"
          >
            <span className="font-mono tabular-nums text-[13px] tracking-[-0.02em] text-[var(--md-sys-color-primary)]">
              STEP {active.n}
            </span>
            <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface)]">
              {active.body}
            </p>
            <p className="text-[13px] leading-[1.6] tracking-[-0.004em] text-[var(--md-sys-color-on-surface-variant)]">
              {active.note}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
