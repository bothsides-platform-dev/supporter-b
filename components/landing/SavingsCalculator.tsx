"use client";

import { useEffect, useRef, useState } from "react";
import { NumericFormat } from "react-number-format";
import { Slider } from "@/components/ui/slider";
import { calculateSavings } from "@/lib/landing/savings";
import { formatKrwReadable } from "@/lib/utils/format";
import { QuoteStartLink } from "./QuoteStartLink";
import styles from "./savings-calculator.module.css";

type Values = { volume: string; reduction: string };
function won(value: number | null): string {
  return value === null
    ? "—"
    : value === 0
      ? "0원"
      : formatKrwReadable(Math.round(value))
          .replace(/([만억조경])원$/, "$1 원")
          .replace(/([만억조경])(?=\d)/g, "$1 ");
}

export function SavingsCalculator() {
  const [values, setValues] = useState<Values>({
    volume: "1000000000",
    reduction: "1",
  });
  const [bounds, setBounds] = useState({ volume: 5000000000, reduction: 3 });
  const result = calculateSavings(values.volume, values.reduction);
  const latest = useRef(result);
  const [display, setDisplay] = useState<number | null>(result.annual);
  const [confirmed, setConfirmed] = useState(result);
  const [presented, setPresented] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const introduced = useRef(false);
  const dragging = useRef(false);
  const runtime = useRef<{
    cancel: () => void;
    commit: (immediate: boolean, emphasize?: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const element = resultRef.current;
    if (!element) return;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let animation: Animation | undefined;
    let committed = latest.current.annual;
    const cancel = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      animation?.cancel();
    };
    const commit = (emphasize: boolean) => {
      const next = latest.current;
      setConfirmed(next);
      if (
        emphasize &&
        !preference?.matches &&
        next.annual !== null &&
        next.annual > 0 &&
        committed !== null &&
        next.annual > committed
      ) {
        animation = element.animate?.(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.025)" },
            { transform: "scale(1)" },
          ],
          { duration: 180 },
        );
      }
      committed = next.annual;
    };
    runtime.current = {
      cancel,
      commit: (immediate, emphasize = true) => {
        clearTimeout(timer);
        if (immediate) commit(emphasize);
        else timer = setTimeout(() => commit(emphasize), 500);
      },
    };
    const show = () => {
      if (introduced.current) return;
      introduced.current = true;
      setPresented(true);
      const target = latest.current.annual;
      if (preference?.matches || target === null || target <= 0) {
        setDisplay(target);
        return;
      }
      const start = performance.now();
      setDisplay(0);
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / 700);
        setDisplay(Math.round(target * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                show();
              }
            },
            { threshold: 0.25 },
          );
    if (observer) observer.observe(element);
    else show();
    const reduce = () => {
      if (preference?.matches) {
        cancelAnimationFrame(frame);
        animation?.cancel();
        setDisplay(latest.current.annual);
      }
    };
    preference?.addEventListener("change", reduce);
    return () => {
      cancel();
      observer?.disconnect();
      preference?.removeEventListener("change", reduce);
      runtime.current = null;
    };
  }, []);

  const change = (next: Values, slider = false) => {
    runtime.current?.cancel();
    introduced.current = true;
    setPresented(true);
    setValues(next);
    latest.current = calculateSavings(next.volume, next.reduction);
    setDisplay(latest.current.annual);
    if (!slider) {
      dragging.current = false;
      setBounds((previous) => ({
        volume: Math.max(previous.volume, Number(next.volume) || 0),
        reduction: Math.max(previous.reduction, Number(next.reduction) || 0),
      }));
    }
    if (!dragging.current) runtime.current?.commit(false);
  };
  const finish = (emphasize = true) => {
    if (!dragging.current) return;
    dragging.current = false;
    runtime.current?.cancel();
    runtime.current?.commit(true, emphasize);
  };
  return (
    <div className={styles.calculator}>
      <div className={styles.result}>
        <p>예상 연간 절감액</p>
        <div
          ref={resultRef}
          className={styles.amount}
          aria-hidden="true"
          style={{ visibility: presented ? "visible" : "hidden" }}
        >
          <strong className="md-numeric" aria-label="예상 연간 절감액">
            {won(display)}
          </strong>
        </div>
        <p aria-hidden="true">
          월평균{" "}
          <span className="md-numeric" aria-label="월평균 절감액">
            {won(result.monthly)}
          </span>
        </p>
        <p className={styles.assumption}>
          연간 카드 거래액{" "}
          <span className="md-numeric">
            {won(values.volume === "" ? null : Number(values.volume))}
          </span>{" "}
          ×{" "}
          <span className="md-numeric">
            {values.reduction === "" ||
            !Number.isFinite(Number(values.reduction))
              ? "—"
              : `${Number(values.reduction)}%p`}
          </span>{" "}
          인하를 가정했어요.
        </p>
      </div>
      <div className={styles.inputs}>
        {(["volume", "reduction"] as const).map((field) => {
          const label =
            field === "volume" ? "연간 카드 거래액" : "수수료 인하 폭";
          const numeric = Number(values[field]);
          const presets =
            field === "volume"
              ? [
                  ["100000000", "1억 원"],
                  ["1000000000", "10억 원"],
                  ["5000000000", "50억 원"],
                ]
              : [
                  ["0.3", "0.3%p"],
                  ["0.5", "0.5%p"],
                  ["1", "1%p"],
                ];
          return (
            <div key={field} className={styles.field}>
              <label htmlFor={`landing-savings-${field}`}>{label}</label>
              <div className={styles.inputGroup}>
                <NumericFormat
                  id={`landing-savings-${field}`}
                  aria-label={label}
                  value={values[field]}
                  valueIsNumericString
                  thousandSeparator={field === "volume" ? "," : undefined}
                  decimalScale={field === "volume" ? 0 : 2}
                  allowNegative={false}
                  isAllowed={({ floatValue }) =>
                    floatValue === undefined ||
                    (field === "volume"
                      ? Number.isSafeInteger(floatValue)
                      : floatValue <= 100)
                  }
                  inputMode={field === "volume" ? "numeric" : "decimal"}
                  className="md-numeric"
                  onValueChange={(value, source) => {
                    if (source.source === "event")
                      change({ ...values, [field]: value.value });
                  }}
                />
                <span>{field === "volume" ? "원" : "%p"}</span>
              </div>
              <div
                onPointerDownCapture={() => {
                  dragging.current = true;
                  introduced.current = true;
                  runtime.current?.cancel();
                  setPresented(true);
                  setDisplay(latest.current.annual);
                }}
                onPointerUp={() => finish()}
                onPointerCancel={() => finish(false)}
                onLostPointerCapture={() => finish(false)}
                onKeyDownCapture={() => {
                  dragging.current = false;
                }}
              >
                <Slider
                  value={Number.isFinite(numeric) ? numeric : 0}
                  min={0}
                  max={bounds[field]}
                  step={field === "volume" ? 10000000 : 0.1}
                  ariaLabel={label}
                  ariaValueText={
                    field === "volume"
                      ? won(values[field] === "" ? null : numeric)
                      : `${values[field] || "—"}%p`
                  }
                  className="min-h-11"
                  onValueChange={(value) =>
                    change({ ...values, [field]: String(value) }, true)
                  }
                  onValueCommit={(_, interaction) => {
                    if (interaction === "pointer") finish();
                  }}
                />
              </div>
              <div className={styles.ticks} aria-hidden="true">
                <span className="md-numeric">
                  {field === "volume" ? "0원" : "0%p"}
                </span>
                <span className="md-numeric">
                  {field === "volume"
                    ? won(bounds.volume)
                    : `${bounds.reduction}%p`}
                </span>
              </div>
              <div className={styles.presets}>
                {presets.map(([value, title]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={
                      numeric === Number(value) && values[field] !== ""
                    }
                    onClick={() => change({ ...values, [field]: value })}
                  >
                    <span className="md-numeric">{title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className={styles.note}>
          수수료가 <span className="md-numeric">3%</span>에서{" "}
          <span className="md-numeric">2%</span>가 되면{" "}
          <span className="md-numeric">1%p</span> 인하예요.
        </p>
      </div>
      <div className={styles.action}>
        <QuoteStartLink className={styles.cta}>
          맞춤 PG 견적 무료로 받기 <span aria-hidden="true">↗</span>
        </QuoteStartLink>
        <p>실제 인하 가능 폭과 요율은 PG 심사 후 정해져요.</p>
      </div>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        예상 연간 절감액 {won(confirmed.annual)}, 월평균{" "}
        {won(confirmed.monthly)}
      </p>
    </div>
  );
}
