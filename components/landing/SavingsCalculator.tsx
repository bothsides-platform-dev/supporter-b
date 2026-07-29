'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useInView } from 'motion/react';
import { Slider } from '@/components/ui/slider';
import { CostComparisonChart } from '@/components/landing/CostComparisonChart';
import { formatKRW } from '@/lib/utils/format';
import { useAnimatedNumber } from '@/lib/landing/use-animated-number';
import {
  SUPPORTER_B_RATE,
  annualMaxSavings,
  gradeFromVolume,
  minCurrentRate,
} from '@/lib/landing/savings';

const VOL_T_MAX = 1000;
const VOL_BASE = 1e8;
const VOL_DECADES = 3;
const DEFAULT_VOL_T = 492;

const RATE_DEFAULT = 240;
const RATE_MAX = 400;
const RATE_STEP = 5;

const IDLE_MS = 6000;

function tToVolume(t: number): number {
  return VOL_BASE * Math.pow(10, (t / VOL_T_MAX) * VOL_DECADES);
}

// 현재 수수료율 슬라이더의 하한(베이시스 포인트). 거래액 등급별 달성 요율 위로 마진을
// 둔 값을 슬라이더 step에 맞춰 스냅한다. 이 아래로는 선택할 수 없어 절감액이 항상 양수다.
function rateFloorBp(volume: number): number {
  return Math.round((minCurrentRate(volume) * 10000) / RATE_STEP) * RATE_STEP;
}

function formatVolume(v: number): string {
  const eok = v / 1e8;
  if (eok < 10) return `${eok.toFixed(1)} 억`;
  if (eok < 100) return `${Math.round(eok).toLocaleString('ko-KR')} 억`;
  return `${Math.round(eok).toLocaleString('ko-KR')} 억`;
}

function formatRate(rate: number): string {
  return `${rate.toFixed(2)} %`;
}

function SliderValueBubble({ pct, text, testId }: { pct: number; text: string; testId?: string }) {
  return (
    <div
      aria-hidden
      data-testid={testId}
      className="pointer-events-none absolute top-1/2 z-10"
      style={{ left: `${pct}%` }}
    >
      <div className="-translate-x-1 -translate-y-1 flex flex-col items-start">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="var(--md-sys-color-on-surface)"
          stroke="var(--md-sys-color-surface)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M5 2.5l13.5 7.8-5.9 1.5-1.5 5.9z" />
        </svg>
        <span className="ml-3 -mt-1 whitespace-nowrap rounded-md bg-[var(--md-sys-color-on-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-2)]">
          {text}
        </span>
      </div>
    </div>
  );
}

export function SavingsCalculator() {
  const [volT, setVolT] = useState(DEFAULT_VOL_T);
  const [rateBp, setRateBp] = useState(RATE_DEFAULT);

  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef, { amount: 0.4 });
  const [hintActive, setHintActive] = useState(false);
  const resetIdleRef = useRef<(() => void) | null>(null);
  // 사용자가 슬라이더를 한 번이라도 만지면 true. 이후로는 힌트 데모를 영구 중단한다
  // (입력을 덮어쓰지 않도록). inView 토글로 effect가 재실행돼도 유지돼야 하므로 ref.
  const interactedRef = useRef(false);
  const [draggingSlider, setDraggingSlider] = useState<'volume' | 'rate' | null>(null);

  // 계산기가 화면에 보이고 일정 시간(IDLE_MS) 입력이 없으면 가짜 커서가 슬라이더를
  // 훑으며 사용법을 보여준다. 사용자가 만지면 즉시 멈추고 다시 재생하지 않는다. 데모가
  // 끝나면 (아직 미조작이면) 다시 idle 카운트다운. 화면 밖이면 중단(동작 줄이기 선호는 무시).
  useEffect(() => {
    if (!inView || interactedRef.current) return;

    const path: [number, number][] = [
      [0, DEFAULT_VOL_T],
      [0.35, 820],
      [0.7, 240],
      [1, DEFAULT_VOL_T],
    ];
    const duration = 3200;
    const valueAt = (p: number): number => {
      for (let i = 1; i < path.length; i += 1) {
        if (p <= path[i][0]) {
          const [t0, v0] = path[i - 1];
          const [t1, v1] = path[i];
          const r = (p - t0) / (t1 - t0);
          const eased = r < 0.5 ? 2 * r * r : 1 - Math.pow(-2 * r + 2, 2) / 2;
          return v0 + (v1 - v0) * eased;
        }
      }
      return path[path.length - 1][1];
    };

    let cancelled = false;
    let idleTimer = 0;
    let raf = 0;
    let startTs = 0;

    const scheduleIdle = () => {
      if (interactedRef.current) return;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(playDemo, IDLE_MS);
    };

    const tick = (ts: number) => {
      if (cancelled || interactedRef.current) return;
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      setVolT(Math.round(valueAt(p)));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setHintActive(false);
        setVolT(DEFAULT_VOL_T);
        scheduleIdle();
      }
    };

    function playDemo() {
      if (cancelled || interactedRef.current) return;
      startTs = 0;
      setHintActive(true);
      raf = requestAnimationFrame(tick);
    }

    // 사용자가 슬라이더를 만지면 호출: 진행 중 데모를 중단하고 이후 재생을 영구 차단.
    resetIdleRef.current = () => {
      interactedRef.current = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      startTs = 0;
      setHintActive(false);
    };

    scheduleIdle();

    return () => {
      cancelled = true;
      window.clearTimeout(idleTimer);
      cancelAnimationFrame(raf);
      resetIdleRef.current = null;
    };
  }, [inView]);

  const volume = useMemo(() => tToVolume(volT), [volT]);
  const rateMinBp = useMemo(() => rateFloorBp(volume), [volume]);
  const currentRate = rateBp / 10000;
  const grade = gradeFromVolume(volume);
  const supporterBRate = SUPPORTER_B_RATE[grade];
  const savings = annualMaxSavings(volume, currentRate);
  const currentCost = Math.round(currentRate * volume);
  const supporterBCost = Math.round(supporterBRate * volume);
  const savingsPct = currentCost > 0 ? (savings / currentCost) * 100 : 0;

  const animatedSavings = useAnimatedNumber(savings);

  const cursorPct = (volT / VOL_T_MAX) * 100;
  const rateCursorPct = ((rateBp - rateMinBp) / (RATE_MAX - rateMinBp)) * 100;

  return (
    <section
      ref={rootRef}
      className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-[var(--s-5)] md:p-[var(--s-8)]"
    >
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-[var(--s-8)] md:gap-0">
        {/* Sidebar — inputs */}
        <div className="flex flex-col gap-[var(--s-8)] md:border-r md:border-[var(--md-sys-color-outline-variant)] md:pr-[var(--s-8)]">
          <div className="flex flex-col gap-[var(--s-3)]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-sm leading-[inherit] tracking-[0.02em] md:tracking-[0.1em] uppercase whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">연간 거래액</span>
              <span className="font-mono tabular-nums text-sm leading-[inherit] text-[var(--md-sys-color-on-surface)] tracking-[0.02em] whitespace-nowrap shrink-0">
                {formatVolume(volume)}
              </span>
            </div>
            <div
              className="relative"
              onPointerDown={() => {
                resetIdleRef.current?.();
                setDraggingSlider('volume');
              }}
              onPointerUp={() => setDraggingSlider(null)}
              onPointerCancel={() => setDraggingSlider(null)}
            >
              <Slider
                value={volT}
                min={0}
                max={VOL_T_MAX}
                step={1}
                onValueChange={(v) => {
                  resetIdleRef.current?.();
                  setVolT(v);
                  // 거래액이 상위 등급으로 올라가 하한이 현재 요율을 넘어서면 핸들을 끌어올린다.
                  const floor = rateFloorBp(tToVolume(v));
                  setRateBp((r) => Math.max(r, floor));
                }}
                ariaLabel="연간 거래액"
              />
              {hintActive && <SliderValueBubble pct={cursorPct} text="드래그해서 조정해 보세요" />}
              {draggingSlider === 'volume' && !hintActive && (
                <SliderValueBubble pct={cursorPct} text={formatVolume(volume)} testId="volume-drag-bubble" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[var(--s-3)]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-sm leading-[inherit] tracking-[0.02em] md:tracking-[0.1em] uppercase whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">현재 PG 수수료율</span>
              <span className="font-mono tabular-nums text-sm leading-[inherit] text-[var(--md-sys-color-on-surface)] tracking-[0.02em] whitespace-nowrap shrink-0">
                {formatRate(rateBp / 100)}
              </span>
            </div>
            <div
              className="relative"
              onPointerDown={() => {
                resetIdleRef.current?.();
                setDraggingSlider('rate');
              }}
              onPointerUp={() => setDraggingSlider(null)}
              onPointerCancel={() => setDraggingSlider(null)}
            >
              <Slider
                value={rateBp}
                min={rateMinBp}
                max={RATE_MAX}
                step={RATE_STEP}
                onValueChange={(v) => {
                  resetIdleRef.current?.();
                  setRateBp(Math.max(v, rateMinBp));
                }}
                ariaLabel="현재 PG 수수료율"
              />
              {draggingSlider === 'rate' && (
                <SliderValueBubble pct={rateCursorPct} text={formatRate(rateBp / 100)} testId="rate-drag-bubble" />
              )}
            </div>
            <div className="flex justify-between font-mono text-sm leading-[inherit] tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)] uppercase">
              <span>{formatRate(rateMinBp / 100)}</span>
              <span>4.00 %</span>
            </div>
          </div>
        </div>

        {/* Output panel — result + chart */}
        <div className="flex flex-col md:pl-[var(--s-8)]">
          <div className="flex flex-col gap-[var(--s-2)]">
            <span className="font-mono text-sm leading-[inherit] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              예상 연간 절감액
            </span>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="md-numeric text-[clamp(26px,7vw,40px)] font-semibold leading-none tracking-[-0.02em] whitespace-nowrap text-[var(--md-sys-color-tertiary)]">
                {formatKRW(Math.round(animatedSavings))}
              </span>
              {currentCost > 0 && (
                <span className="font-mono tabular-nums text-sm leading-[inherit] tracking-[0.06em] text-[var(--md-sys-color-on-surface-variant)]">
                  ▾ {savingsPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <div className="mt-[var(--s-6)] pt-[var(--s-6)] border-t border-[var(--md-sys-color-outline-variant)]">
            <CostComparisonChart
              currentCost={currentCost}
              supporterBCost={supporterBCost}
            />
          </div>
        </div>
      </div>

      <p className="mt-[var(--s-7)] pt-[var(--s-7)] border-t border-[var(--md-sys-color-outline-variant)] font-mono text-[10px] tracking-[0.06em] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
        * 예상 절감액은 추정치입니다. 카드 수수료를 포함한 모든 항목(정산주기·보증보험·가입비 등)이
        협상 대상이며, 실제 절감액은 PG사 견적·조건에 따라 달라질 수 있습니다.
      </p>
    </section>
  );
}
