'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, useInView } from 'motion/react';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

// 정적 예시 비교표 — 기존 'LiveBidSimulation'(스크롤 구동·토스트)을 대체한다.
// 실제 견적이 아닌 표현용 예시값. 다수 PG사의 조건을 한 화면에서 비교하는 현실적인
// B2B 뷰를 보여주되, AI 챗/결과 느낌을 배제한다. 화면에 보이는 동안 행 스포트라이트가
// 2.5초 간격으로 단계적으로 이동하며 표를 훑어준다.

type Status = { label: string; color: ChipColor };

type Offer = {
  pg: string;
  fee: string;
  settlement: string;
  guarantee: string;
  joinFee: string;
  approval: Status;
  negotiable: Status;
  recommended?: boolean;
};

const COLUMNS = [
  'PG사',
  '수수료',
  '정산주기',
  '보증보험',
  '가입비',
  '승인 상태',
  '협의 가능 여부',
] as const;

const OFFERS: Offer[] = [
  {
    pg: 'PG A',
    fee: '1.85%',
    settlement: 'D+1',
    guarantee: '면제',
    joinFee: '면제',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '가능', color: 'tertiary' },
    recommended: true,
  },
  {
    pg: 'PG B',
    fee: '1.95%',
    settlement: 'D+1',
    guarantee: '1천만원',
    joinFee: '면제',
    approval: { label: '검토중', color: 'warning' },
    negotiable: { label: '가능', color: 'tertiary' },
  },
  {
    pg: 'PG C',
    fee: '2.10%',
    settlement: 'D+2',
    guarantee: '면제',
    joinFee: '10만원',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '제한', color: 'surface' },
  },
];

const STEP_MS = 2500;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const headCls =
  'px-[var(--s-4)] py-[var(--s-3)] text-left font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap';
const cellCls =
  'px-[var(--s-4)] py-[var(--s-4)] align-middle border-t border-[var(--md-sys-color-outline-variant)] whitespace-nowrap';
const numCls = 'md-numeric text-[var(--text-base)] text-[var(--md-sys-color-on-surface)]';

// 활성(스포트라이트) 행의 셀 내용을 살짝 키워(scale) 강조한다 — transform 이라
// 행 높이(레이아웃)에는 영향을 주지 않는다.
function GrowCell({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <td className={cellCls}>
      <span
        className="inline-flex items-center gap-2 origin-left transition-transform duration-300"
        style={{ transform: active ? 'scale(1.06)' : 'scale(1)' }}
      >
        {children}
      </span>
    </td>
  );
}

export function OfferComparisonTable() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [activeRow, setActiveRow] = useState(0);

  // 화면에 보이는 동안 행 스포트라이트를 단계적으로 이동(반복). 화면을 벗어나거나
  // 동작 줄이기 선호 시 멈춤(첫 행 = 추천 PG 에 고정).
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setActiveRow((r) => (r + 1) % OFFERS.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [inView]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="flex flex-col gap-[var(--s-3)]"
    >
      <div className="overflow-x-auto rounded-md border border-[var(--md-sys-color-outline-variant)]">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead className="bg-[var(--md-sys-color-surface-container-low)]">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col} scope="col" className={headCls}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OFFERS.map((o, i) => {
              const isActive = i === activeRow;
              return (
                <tr
                  key={o.pg}
                  className={[
                    'transition-colors duration-300',
                    isActive
                      ? 'bg-[var(--md-sys-color-surface-container-high)]'
                      : o.recommended
                        ? 'bg-[var(--md-sys-color-tertiary-container)]/30'
                        : '',
                  ].join(' ')}
                >
                  <GrowCell active={isActive}>
                    {o.recommended && (
                      <span
                        aria-hidden
                        className="inline-block h-3.5 w-0.5 rounded-full bg-[var(--md-sys-color-tertiary)]"
                      />
                    )}
                    <span
                      className={[
                        'text-[var(--text-base)] font-medium transition-colors duration-300',
                        isActive
                          ? 'text-[var(--md-sys-color-primary)]'
                          : 'text-[var(--md-sys-color-on-surface)]',
                      ].join(' ')}
                    >
                      {o.pg}
                    </span>
                    {o.recommended && <Chip label="추천" color="tertiary" />}
                  </GrowCell>
                  <GrowCell active={isActive}>
                    <span className={numCls}>{o.fee}</span>
                  </GrowCell>
                  <GrowCell active={isActive}>
                    <span className={numCls}>{o.settlement}</span>
                  </GrowCell>
                  <GrowCell active={isActive}>
                    <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">
                      {o.guarantee}
                    </span>
                  </GrowCell>
                  <GrowCell active={isActive}>
                    <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">
                      {o.joinFee}
                    </span>
                  </GrowCell>
                  <GrowCell active={isActive}>
                    <Chip label={o.approval.label} color={o.approval.color} />
                  </GrowCell>
                  <GrowCell active={isActive}>
                    <Chip label={o.negotiable.label} color={o.negotiable.color} />
                  </GrowCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[var(--text-2xs)] tracking-[0.04em] text-[var(--md-sys-color-on-surface-variant)]">
        * 표시 값은 이해를 돕기 위한 예시이며, 실제 견적은 PG사·조건에 따라 달라집니다.
      </p>
    </motion.div>
  );
}
