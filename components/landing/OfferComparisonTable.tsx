'use client';

import { motion } from 'motion/react';
import { type ReactNode } from 'react';
import { Chip, type ChipColor } from '@/components/primitives/Chip';

// 정적 예시 비교표 — 기존 'LiveBidSimulation'(스크롤 구동·토스트)을 대체한다.
// 실제 견적이 아닌 표현용 예시값. 다수 PG사의 조건을 한 화면에서 비교하는 현실적인
// B2B 뷰를 보여주되, AI 챗/결과 느낌을 배제한다. 표는 부모(SolutionShowcase)가 내려주는
// activeStep 에 따라, 그 단계의 해결 포인트가 말하는 컬럼을 또렷하게 하이라이트한다.

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

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// 컬럼 인덱스: 0 PG사 · 1 수수료 · 2 정산주기 · 3 보증보험 · 4 가입비 · 5 승인 상태 · 6 협의 가능 여부
// 해결 포인트(SolutionShowcase) 단계 → 강조할 컬럼(들). 마지막 단계는 컬럼 대신 추천 PG '행'을 강조.
const STEP_COLUMNS: readonly (readonly number[])[] = [
  [1], // 투명한 수수료 견적
  [2, 3, 4, 5], // 정산·보증·가입·승인 조건 비교
  [6], // 추가 협의
  [], // 최적 조건 = 추천 PG 행
];
const STEP_ROW: readonly (number | null)[] = [null, null, null, 0];

const headCls =
  'px-[var(--s-4)] py-[var(--s-3)] text-left font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase whitespace-nowrap transition-colors duration-300';
const cellCls =
  'px-[var(--s-4)] py-[var(--s-4)] align-middle border-t border-[var(--md-sys-color-outline-variant)] whitespace-nowrap transition-colors duration-300';
const numCls = 'md-numeric text-[var(--text-base)] text-[var(--md-sys-color-on-surface)]';

// 활성 컬럼(또는 활성 행)에 속한 셀을 배경 틴트 + 살짝 키워 또렷하게 강조한다.
function Cell({
  col,
  activeCols,
  rowActive,
  children,
}: {
  col: number;
  activeCols: readonly number[];
  rowActive: boolean;
  children: ReactNode;
}) {
  const colActive = activeCols.includes(col);
  const highlight = colActive || rowActive;
  return (
    <td
      className={[
        cellCls,
        colActive ? 'bg-[var(--md-sys-color-primary-container)]/25' : '',
      ].join(' ')}
    >
      <span
        className="inline-flex items-center gap-2 origin-left transition-transform duration-300"
        style={{ transform: highlight ? 'scale(1.05)' : 'scale(1)' }}
      >
        {children}
      </span>
    </td>
  );
}

export function OfferComparisonTable({ activeStep = null }: { activeStep?: number | null }) {
  const activeCols = activeStep != null ? (STEP_COLUMNS[activeStep] ?? []) : [];
  const activeRow = activeStep != null ? (STEP_ROW[activeStep] ?? null) : null;

  return (
    <motion.div
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
              {COLUMNS.map((col, ci) => {
                const colActive = activeCols.includes(ci);
                return (
                  <th
                    key={col}
                    scope="col"
                    data-active={colActive ? 'true' : undefined}
                    className={[
                      headCls,
                      colActive
                        ? 'text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/30'
                        : 'text-[var(--md-sys-color-on-surface-variant)]',
                    ].join(' ')}
                  >
                    {col}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {OFFERS.map((o, i) => {
              const rowActive = activeRow === i;
              return (
                <tr
                  key={o.pg}
                  className={[
                    'transition-colors duration-300',
                    rowActive
                      ? 'bg-[var(--md-sys-color-tertiary-container)]/50'
                      : o.recommended
                        ? 'bg-[var(--md-sys-color-tertiary-container)]/25'
                        : '',
                  ].join(' ')}
                >
                  <Cell col={0} activeCols={activeCols} rowActive={rowActive}>
                    {o.recommended && (
                      <span
                        aria-hidden
                        className="inline-block h-3.5 w-0.5 rounded-full bg-[var(--md-sys-color-tertiary)]"
                      />
                    )}
                    <span
                      className={[
                        'text-[var(--text-base)] font-medium transition-colors duration-300',
                        rowActive
                          ? 'text-[var(--md-sys-color-primary)]'
                          : 'text-[var(--md-sys-color-on-surface)]',
                      ].join(' ')}
                    >
                      {o.pg}
                    </span>
                    {o.recommended && <Chip label="추천" color="tertiary" />}
                  </Cell>
                  <Cell col={1} activeCols={activeCols} rowActive={rowActive}>
                    <span className={numCls}>{o.fee}</span>
                  </Cell>
                  <Cell col={2} activeCols={activeCols} rowActive={rowActive}>
                    <span className={numCls}>{o.settlement}</span>
                  </Cell>
                  <Cell col={3} activeCols={activeCols} rowActive={rowActive}>
                    <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">
                      {o.guarantee}
                    </span>
                  </Cell>
                  <Cell col={4} activeCols={activeCols} rowActive={rowActive}>
                    <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">
                      {o.joinFee}
                    </span>
                  </Cell>
                  <Cell col={5} activeCols={activeCols} rowActive={rowActive}>
                    <Chip label={o.approval.label} color={o.approval.color} />
                  </Cell>
                  <Cell col={6} activeCols={activeCols} rowActive={rowActive}>
                    <Chip label={o.negotiable.label} color={o.negotiable.color} />
                  </Cell>
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
