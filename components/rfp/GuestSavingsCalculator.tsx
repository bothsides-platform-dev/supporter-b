"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';
import { animate } from 'motion/react';
import confetti from 'canvas-confetti';
import { NumericFormat } from 'react-number-format';
import { publicNumericGroupClass, publicNumericInputClass } from '@/components/forms/inputs';
import { formatKrwReadable } from '@/lib/utils/format';
import { Slider } from '@/components/ui/slider';
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
  return value === null ? '—' : Math.round(value) === 0 ? '0원' : formatKrwReadable(Math.round(value)).replace(/([만억조경])원$/, '$1 원').replace(/([만억조경])(?=\d)/g, '$1 ');
}

export function GuestSavingsCalculator({ values, onChange, memoryRef, headingRef }: {
  values: Values;
  onChange: (values: Values) => void;
  memoryRef: RefObject<SavingsMemory>;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const [editing, setEditing] = useState<keyof Values | null>(null);
  const [bounds, setBounds] = useState({ volume: Math.max(5000000000, Number(values.volume) || 0), reduction: Math.max(3, Number(values.reduction) || 0) });
  const dragging = useRef(false);
  const returnFocus = useRef<keyof Values | null>(null);
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
    commit: (value: number | null, immediate: boolean, celebrate?: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const memory = memoryRef.current;
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
      memory.lastBurst = Date.now();
      burstTimer = setTimeout(() => fire.reset(), large ? 1500 : 600);
    };
    const commit = (value: number | null, celebrate = true) => {
      const previous = memory.committed;
      memory.committed = value;
      setConfirmed(value);
      setConfirmedMonthly(latestMonthly.current);
      if (celebrate && memory.introduced && value !== null && value > 0 && previous !== null && value > previous && Date.now() - memory.lastBurst >= 2000) burst(false);
    };
    runtime.current = { cancel, commit: (value, immediate, celebrate = true) => {
      if (immediate) commit(value, celebrate);
      else timer = setTimeout(() => commit(value, celebrate), 500);
    } };
    const show = () => {
      setPresented(true);
      if (memory.introduced) return;
      memory.introduced = true;
      const target = latestResult.current;
      memory.committed = target;
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
      memory.committed = latestResult.current;
      preference?.removeEventListener('change', reduce);
    };
  }, [memoryRef]);

  const change = (next: Values, mode: 'input' | 'slider' = 'input') => {
    runtime.current?.cancel();
    setPresented(true);
    onChange(next);
    const nextResult = savings(next);
    latestResult.current = nextResult;
    latestMonthly.current = savings(next, 12);
    setDisplay(nextResult);
    if (mode === 'input') {
      dragging.current = false;
      setBounds(previous => ({ volume: Math.max(previous.volume, Number(next.volume) || 0), reduction: Math.max(previous.reduction, Number(next.reduction) || 0) }));
    }
    if (!dragging.current) runtime.current?.commit(nextResult, false);
  };
  const finishPointer = (celebrate = true) => {
    if (!dragging.current) return;
    dragging.current = false;
    runtime.current?.cancel();
    runtime.current?.commit(latestResult.current, true, celebrate);
  };
  return <section className={styles.calculator} aria-labelledby="savings-title">
    <h2 id="savings-title" ref={headingRef} tabIndex={-1}>PG 수수료, 얼마나 아낄 수 있을까요?</h2>
    <div className={styles.result} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.confetti} aria-hidden="true" />
      <div ref={resultRef} className={styles.amount} style={{ visibility: presented ? 'visible' : 'hidden' }}>
        <span>연간 절감 예상</span> <strong className="md-numeric" aria-label="연간 절감 예상액">{won(display)}</strong>
      </div>
      <p>월평균 <span className="md-numeric">{won(monthly)}</span>을 아낄 수 있어요.</p>
    </div>
    <p className={styles.assumption}>연간 거래액 <span className="md-numeric">{won(values.volume === '' ? null : Number(values.volume))}</span> · <span className="md-numeric">{values.reduction === '' || !Number.isFinite(Number(values.reduction)) ? '—' : `${Number(values.reduction)}%p`}</span> 인하를 가정했어요.</p>
    <div className={styles.fields}>
      {(['volume', 'reduction'] as const).map(field => {
        const label = field === 'volume' ? '연간 카드 거래액' : '수수료 인하 폭';
        const numeric = Number(values[field]);
        const readable = field === 'volume' ? won(values[field] === '' ? null : numeric) : values[field] === '' || !Number.isFinite(numeric) ? '—' : `${numeric.toFixed(Math.max(1, (values[field].split('.')[1] || '').length))}%p`;
        return <div key={field}>
          <div className={styles.fieldHeader}>
            <label htmlFor={`savings-${field}`}>{label}</label>
            {editing === field ? <div className={publicNumericGroupClass}>
              <NumericFormat id={`savings-${field}`} aria-label={label} value={values[field]} valueIsNumericString
                thousandSeparator={field === 'volume' ? ',' : undefined} decimalScale={field === 'volume' ? 0 : 2} allowNegative={false}
                isAllowed={({ floatValue }) => floatValue === undefined || (field === 'volume' ? Number.isSafeInteger(floatValue) : floatValue <= 100)}
                inputMode={field === 'volume' ? 'numeric' : 'decimal'} className={publicNumericInputClass}
                getInputRef={(input: HTMLInputElement | null) => { input?.focus(); }}
                onBlur={() => setEditing(null)} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); returnFocus.current = field; setEditing(null); } }}
                onValueChange={(v, source) => { if (source.source === 'event') change({ ...values, [field]: v.value }); }} />
              <span>{field === 'volume' ? '원' : '%p'}</span>
            </div> : <button ref={button => { if (button && returnFocus.current === field) { returnFocus.current = null; button.focus(); } }} type="button" className={styles.value} aria-label={`${label} 직접 입력`} onClick={() => { runtime.current?.cancel(); setDisplay(latestResult.current); setPresented(true); runtime.current?.commit(latestResult.current, false); setEditing(field); }}><span className="md-numeric">{readable}</span></button>}
          </div>
          <div onPointerDownCapture={() => { dragging.current = true; runtime.current?.cancel(); setDisplay(latestResult.current); }}
            onPointerUp={() => finishPointer()} onPointerCancel={() => finishPointer(false)} onLostPointerCapture={() => finishPointer(false)}
            onKeyDownCapture={() => { dragging.current = false; }}>
            <Slider value={Number.isFinite(numeric) ? numeric : 0} min={0} max={bounds[field]} step={field === 'volume' ? 10000000 : 0.1}
              ariaLabel={label} ariaValueText={readable} className="min-h-11"
              onValueChange={value => change({ ...values, [field]: String(value) }, 'slider')}
              onValueCommit={(_, interaction) => { if (interaction === 'pointer') finishPointer(); }} />
          </div>
          <div className={styles.ticks} aria-hidden="true"><span className="md-numeric">{field === 'volume' ? '0원' : '0%p'}</span><span className="md-numeric">{field === 'volume' ? won(bounds.volume) : `${bounds.reduction}%p`}</span></div>
        </div>;
      })}
    </div>
    <p className={styles.note}>수수료가 <span className="md-numeric">3%</span>에서 <span className="md-numeric">2%</span>가 되면 <span className="md-numeric">1%p</span> 인하예요.<br />실제 인하 가능 폭과 요율은 PG 심사 후 정해져요.</p>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label="확정 절감 예상">연간 {won(confirmed)} 절감 예상, 월평균 {won(confirmedMonthly)}</p>
  </section>;
}
