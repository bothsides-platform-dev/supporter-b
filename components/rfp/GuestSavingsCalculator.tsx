"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';
import { animate } from 'motion/react';
import confetti from 'canvas-confetti';
import { NumericFormat } from 'react-number-format';
import { publicNumericGroupClass, publicNumericInputClass } from '@/components/forms/inputs';
import { formatKrwReadable } from '@/lib/utils/format';
import styles from './guest-savings.module.css';

type Values = { volume: string; reduction: string };
export type SavingsMemory = { introduced: boolean; committed: number | null; lastBurst: number };
function savings(values: Values, months = 1) {
  if (values.volume === '' || values.reduction === '' || !Number.isFinite(Number(values.reduction))) return null;
  // Decimal percentage points become integer basis points before money arithmetic.
  const numerator = BigInt(values.volume) * BigInt(Math.round(Number(values.reduction) * 100));
  const denominator = BigInt(10000) * BigInt(months);
  return Number((numerator + denominator / BigInt(2)) / denominator);
}
function won(value: number | null) {
  return value === null ? '—' : Math.round(value) === 0 ? '0원' : formatKrwReadable(Math.round(value)).replace(/([만억조경])원$/, '$1 원');
}

export function GuestSavingsCalculator({ values, onChange, memoryRef, headingRef }: {
  values: Values;
  onChange: (values: Values) => void;
  memoryRef: RefObject<SavingsMemory>;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const result = savings(values);
  const monthly = savings(values, 12);
  const latestResult = useRef(result);
  const latestMonthly = useRef(monthly);
  const [display, setDisplay] = useState(result);
  const [presented, setPresented] = useState(false);
  const [confirmed, setConfirmed] = useState(result);
  const [confirmedMonthly, setConfirmedMonthly] = useState(monthly);
  const resultRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<{
    cancel: () => void;
    commit: (value: number | null, immediate: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const element = resultRef.current;
    const canvas = canvasRef.current;
    if (!element || !canvas) return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const fire = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let burstTimer: ReturnType<typeof setTimeout> | undefined;
    let pop: ReturnType<typeof animate> | undefined;
    const cancel = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(burstTimer);
      pop?.stop();
      element.style.transform = '';
      fire.reset();
    };
    const burst = (large: boolean) => {
      if (preference?.matches) return;
      const primary = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim() || '#0061A4';
      const options = { colors: [primary], particleCount: large ? 60 : 18, ticks: large ? 90 : 36,
        startVelocity: large ? 24 : 14, spread: 65, gravity: 0.8, scalar: large ? 0.9 : 0.65 };
      void fire({ ...options, angle: 65, origin: { x: 0.18, y: 0.7 } });
      void fire({ ...options, angle: 115, origin: { x: 0.82, y: 0.7 } });
      memoryRef.current.lastBurst = Date.now();
      burstTimer = setTimeout(() => fire.reset(), large ? 1500 : 600);
    };
    const commit = (value: number | null) => {
      const previous = memoryRef.current.committed;
      memoryRef.current.committed = value;
      setConfirmed(value);
      setConfirmedMonthly(latestMonthly.current);
      if (memoryRef.current.introduced && value !== null && value > 0 && previous !== null && value > previous && Date.now() - memoryRef.current.lastBurst >= 2000) burst(false);
    };
    runtime.current = { cancel, commit: (value, immediate) => {
      if (immediate) commit(value);
      else timer = setTimeout(() => commit(value), 500);
    } };
    const show = () => {
      setPresented(true);
      if (memoryRef.current.introduced) return;
      memoryRef.current.introduced = true;
      const target = latestResult.current;
      memoryRef.current.committed = target;
      setConfirmed(target);
      setConfirmedMonthly(latestMonthly.current);
      if (preference?.matches || target === null || target <= 0) return;
      const start = performance.now();
      setDisplay(0);
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / 700);
        setDisplay(target * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
        else {
          pop = animate(element, { scale: [1, 1.04, 1] }, { duration: 0.24 });
          burst(true);
        }
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); show(); }
    }, { threshold: 0.25 });
    if (observer) observer.observe(element); else show();
    const reduce = () => { if (preference?.matches) { cancel(); setDisplay(latestResult.current); commit(latestResult.current); } };
    preference?.addEventListener('change', reduce);
    return () => {
      observer?.disconnect(); cancel(); runtime.current = null;
      memoryRef.current.committed = latestResult.current;
      preference?.removeEventListener('change', reduce);
    };
  }, [memoryRef]);

  const change = (next: Values, immediate = false) => {
    runtime.current?.cancel();
    setPresented(true);
    onChange(next);
    const nextResult = savings(next);
    latestResult.current = nextResult;
    latestMonthly.current = savings(next, 12);
    setDisplay(nextResult);
    runtime.current?.commit(nextResult, immediate);
  };
  return <section className={styles.calculator} aria-labelledby="savings-title">
    <h2 id="savings-title" ref={headingRef} tabIndex={-1}>PG 수수료, 얼마나 아낄 수 있을까요?</h2>
    <div className={styles.fields}>
      <div>
        <label htmlFor="savings-volume">연간 카드 거래액</label>
        <div className={publicNumericGroupClass}>
          <NumericFormat id="savings-volume" value={values.volume} valueIsNumericString thousandSeparator="," decimalScale={0} allowNegative={false}
            isAllowed={({ floatValue }) => floatValue === undefined || Number.isSafeInteger(floatValue)}
            inputMode="numeric" className={publicNumericInputClass} onValueChange={(v, source) => { if (source.source === 'event') change({ ...values, volume: v.value }); }} />
          <span>원</span>
        </div>
        <div className={styles.presets} role="group" aria-label="거래액 빠른 선택">
          {[1, 5, 10].map(n => <button key={n} type="button" aria-pressed={Number(values.volume) === n * 100000000} onClick={() => change({ ...values, volume: String(n * 100000000) }, true)}>{n}억 원</button>)}
        </div>
      </div>
      <span className={styles.multiply} aria-hidden="true">×</span>
      <div>
        <label htmlFor="savings-reduction">수수료 인하 폭</label>
        <div className={publicNumericGroupClass}>
          <NumericFormat id="savings-reduction" value={values.reduction} valueIsNumericString decimalScale={2} allowNegative={false}
            isAllowed={({ floatValue }) => floatValue === undefined || floatValue <= 100}
            inputMode="decimal" className={publicNumericInputClass} onValueChange={(v, source) => { if (source.source === 'event') change({ ...values, reduction: v.value }); }} />
          <span>%p</span>
        </div>
        <div className={styles.presets} role="group" aria-label="인하 폭 빠른 선택">
          {['0.1', '0.3', '0.5'].map(n => <button key={n} type="button" aria-pressed={Number(values.reduction) === Number(n)} onClick={() => change({ ...values, reduction: n }, true)}>{n}%p</button>)}
        </div>
      </div>
    </div>
    <div className={styles.result} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.confetti} aria-hidden="true" />
      <div ref={resultRef} className={styles.amount} style={{ visibility: presented ? 'visible' : 'hidden' }}>
        <span>연간</span> <strong className="md-numeric" aria-label="연간 절감 예상액">{won(display)}</strong> <span>절감 예상</span>
      </div>
      <p>월평균 <span className="md-numeric">{won(monthly)}</span>을 아낄 수 있어요.</p>
    </div>
    <p className={styles.note}>입력한 조건으로 계산한 예시예요. 실제 요율은 PG 심사 후 정해져요.</p>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label="확정 절감 예상">연간 {won(confirmed)} 절감 예상, 월평균 {won(confirmedMonthly)}</p>
  </section>;
}
