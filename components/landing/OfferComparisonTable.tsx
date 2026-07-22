'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon } from '@/components/icons';
import { Chip } from '@/components/primitives/Chip';
import {
  COLUMNS,
  OFFERS,
  STEP_COLUMNS,
  STEP_ROW,
} from '@/components/landing/offer-comparison-data';

// 정적 예시 비교표 — 기존 'LiveBidSimulation'(스크롤 구동·토스트)을 대체한다.
// 실제 견적이 아닌 표현용 예시값. 다수 PG사의 조건을 한 화면에서 비교하는 현실적인
// B2B 뷰를 보여주되, AI 챗/결과 느낌을 배제한다. 표는 부모(SolutionShowcase)가 내려주는
// activeStep 에 따라, 그 단계의 해결 포인트가 말하는 컬럼을 또렷하게 하이라이트한다.
// 예시값·컬럼·단계 매핑은 offer-comparison-data.ts 에서 수정한다.

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// 서브픽셀 반올림/스냅으로 실제 끝인데도 scrollLeft가 미세하게 모자란 경우 페이드가
// 깜빡이는 것을 막기 위한 여유값.
const SCROLL_FADE_THRESHOLD_PX = 4;

function computeCanScrollRight(el: HTMLElement): boolean {
  return el.scrollWidth - el.clientWidth - el.scrollLeft > SCROLL_FADE_THRESHOLD_PX;
}

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

export function OfferComparisonTable({
  activeStep = null,
  showScrollFade = true,
}: {
  activeStep?: number | null;
  /** 장식용 목업(예: HeroProductWindow)처럼 overflow-x-clip 등으로 실제 스크롤이
   *  불가능한 컨테이너에 렌더될 때는 false로 꺼야 한다. 그런 컨테이너는 scrollLeft가
   *  0에 고정돼 스크롤 이벤트가 절대 발생하지 않으므로, 켜두면 canScrollRight가
   *  마운트 시점 상태로 영구 고정된 채(대개 true) 페이드가 계속 떠 있게 된다. */
  showScrollFade?: boolean;
}) {
  const activeCols = activeStep != null ? (STEP_COLUMNS[activeStep] ?? []) : [];
  const activeRow = activeStep != null ? (STEP_ROW[activeStep] ?? null) : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (!showScrollFade) return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setCanScrollRight(computeCanScrollRight(el));
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    // jsdom(테스트 환경)엔 ResizeObserver가 없으므로 방어적으로 가드한다 — 실제 브라우저는 항상 지원.
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
    resizeObserver?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      resizeObserver?.disconnect();
    };
  }, [showScrollFade]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="flex flex-col gap-[var(--s-3)]"
    >
      <div className="relative">
        <div
          ref={scrollRef}
          data-testid={showScrollFade ? 'offer-table-scroll-container' : undefined}
          className="overflow-x-auto snap-x snap-proximity rounded-md border border-[var(--md-sys-color-outline-variant)]"
        >
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
                        'snap-start',
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
        {showScrollFade && (
          <div
            aria-hidden
            data-testid="offer-table-scroll-fade"
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--md-sys-color-surface)] to-transparent transition-opacity duration-200"
            style={{ opacity: canScrollRight ? 1 : 0 }}
          >
            <ChevronRightIcon
              size={16}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]"
            />
          </div>
        )}
      </div>
      <p className="font-mono text-[10px] tracking-[0.06em] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
        * 표시 값은 이해를 돕기 위한 예시이며, 실제 견적은 PG사·조건에 따라 달라집니다.
      </p>
    </motion.div>
  );
}
