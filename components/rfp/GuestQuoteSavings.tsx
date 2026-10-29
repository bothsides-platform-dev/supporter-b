'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useStore } from 'zustand';
import { NumericFormat } from 'react-number-format';
import confetti from 'canvas-confetti';
import { GuestQuoteController, saveQuoteProgress, sendQuoteRequest } from '@/lib/guest-rfp/quote-controller';
import { quoteSavingsResponseSchema, type QuoteSavings } from '@/lib/guest-rfp/quote-savings';
import { Button } from '@/components/primitives/Button';
import { publicInputClass } from '@/components/forms/inputs';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import styles from './guest-savings.module.css';

const won = (value: number) => Math.round(value).toLocaleString('ko-KR') + '원';
function PositiveResult({ annual, monthly, memoryRef }: { annual: number; monthly: number; memoryRef: RefObject<{ introduced: boolean; previous: number; lastBurst: number }> }) {
  const [display, setDisplay] = useState(annual);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const first = !memoryRef.current.introduced;
    const increase = annual > memoryRef.current.previous && Date.now() - memoryRef.current.lastBurst >= 2000;
    memoryRef.current.introduced = true;
    memoryRef.current.previous = annual;
    if (preference?.matches || !canvas.current) return;
    const fire = confetti.create(canvas.current, { resize: true, useWorker: false, disableForReducedMotion: true });
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const burst = () => {
      if ((!first && !increase) || preference?.matches) return;
      memoryRef.current.lastBurst = Date.now();
      const colors = [getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim() || '#0061A4'];
      for (const x of [.18, .82]) void fire({ colors, particleCount: first ? 60 : 18, ticks: first ? 90 : 36, startVelocity: first ? 24 : 14, spread: 65, gravity: .8, origin: { x, y: .7 } });
      timer = setTimeout(() => fire.reset(), first ? 1500 : 600);
    };
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 700);
      setDisplay(annual * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick); else burst();
    };
    if (first) frame = requestAnimationFrame(tick); else burst();
    const reduce = () => { if (preference?.matches) { cancelAnimationFrame(frame); fire.reset(); setDisplay(annual); } };
    preference?.addEventListener('change', reduce);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); fire.reset(); preference?.removeEventListener('change', reduce); };
  }, [annual, memoryRef]);
  return <div className={styles.result} aria-hidden="true">
    <canvas ref={canvas} className={styles.confetti} />
    <div className={styles.amount}><span>연간 절감 예상</span><strong className="md-numeric">{won(display)}</strong></div>
    <p>월평균 <span className="md-numeric">{won(monthly)}</span>을 아낄 수 있어요.</p>
  </div>;
}
export function GuestQuoteSavings({ quote, headingRef, selectedPgId, onBusyChange }: {
  quote: GuestQuoteController; headingRef?: RefObject<HTMLHeadingElement | null>; selectedPgId?: string; onBusyChange?: (busy: boolean) => void;
}) {
  const context = useSyncExternalStore(quote.subscribe, quote.snapshot, quote.snapshot);
  const draft = useStore(quote.session.store);
  const inputs = context.savings ?? {};
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const generation = useRef(0);
  const memory = useRef({ introduced: false, previous: 0, lastBurst: -Infinity });
  const keyFor = (input: QuoteSavings) => JSON.stringify([draft.contractType, draft.industryMode, draft.industryGroupId,
    draft.customIndustryName, draft.currentPgs, draft.currentFeeRate, input.annualRevenue, input.annualCardVolume, input.currentFeeVat, input.pgId]);
  const key = keyFor(inputs);
  const latestKey = useRef(key);
  useEffect(() => { latestKey.current = key; }, [key]);
  const response = inputs.inputKey === key ? inputs.response : undefined;
  const update = (patch: Partial<QuoteSavings>) => {
    ++generation.current;
    setError('');
    const next = { ...quote.snapshot().savings, ...patch, response: undefined, inputKey: undefined };
    quote.update({ savings: next });
    return next;
  };
  const calculate = async (values = quote.snapshot().savings ?? {}) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusyChange?.(true); setError('');
    const version = ++generation.current;
    const inputKey = keyFor(values);
    try {
      const saved = await saveQuoteProgress(quote.session);
      const { annualRevenue, annualCardVolume, currentFeeVat, pgId } = values;
      const output = quoteSavingsResponseSchema.parse(await sendQuoteRequest('savings', {
        id: quote.session.draft.id, revision: saved.revision, annualRevenue, annualCardVolume, currentFeeVat, pgId,
      }));
      if (version === generation.current && latestKey.current === inputKey)
        quote.update({ savings: { ...values, response: output, inputKey } });
    } catch {
      if (version === generation.current) setError('지금은 절감액을 확인할 수 없어요. 견적 신청은 계속할 수 있어요.');
    } finally { inFlight.current = false; setBusy(false); onBusyChange?.(false); }
  };
  // An explicitly chosen consultation PG replaces the comparison PG. Mounting
  // a restored draft alone never starts a paid analysis or a savings request.
  const previousSelection = useRef(selectedPgId);
  useEffect(() => {
    if (!selectedPgId || previousSelection.current === selectedPgId) return;
    previousSelection.current = selectedPgId;
    const next = { ...quote.snapshot().savings, pgId: selectedPgId, response: undefined, inputKey: undefined };
    quote.update({ savings: next });
    // Wait until this render's input binding has reached the latest-key ref.
    const timer = setTimeout(() => { void calculate(next); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only an explicit PG selection triggers this request.
  }, [selectedPgId, quote]);
  const result = response?.result;
  const isNew = draft.contractType === 'new';
  const resultMessage = result?.status === 'calculated' ? '연간 ' + won(result.annual) + ' 절감 예상, 월평균 ' + won(result.monthly)
    : result?.status === 'no_saving' ? '현재 조건에서는 절감 효과가 확인되지 않았어요. PG 상담에서 조건을 확인해요.'
    : result?.status === 'unavailable' && result.reason === 'rates' ? '계산할 수 있는 요율이 아직 없어요. 견적 신청은 계속할 수 있어요.'
    : '매출 구간과 카드 거래액을 확인하면 예상 절감액을 계산해요. 입력하지 않아도 견적을 신청할 수 있어요.';
  return <section className={styles.calculator} aria-labelledby="savings-title">
    <h2 id="savings-title" ref={headingRef} tabIndex={-1}>PG 수수료, 얼마나 아낄 수 있을까요?</h2>
      <div className="space-y-4">
        <label className="block space-y-2"><span>{isNew ? '예상 연매출 구간' : '연매출 구간'}</span>
          <select aria-label={isNew ? '예상 연매출 구간' : '연매출 구간'} className={publicInputClass} value={inputs.annualRevenue ?? ''} onChange={e => update({ annualRevenue: e.target.value === '' ? undefined : Number(e.target.value) })}>
            <option value="">선택해주세요</option>
            <option value="300000000">3억 원 이하</option><option value="500000000">3억 원 초과 ~ 5억 원 이하</option>
            <option value="1000000000">5억 원 초과 ~ 10억 원 이하</option><option value="3000000000">10억 원 초과 ~ 30억 원 이하</option><option value="3000000001">30억 원 초과</option>
          </select>
        </label>
        <label className="block space-y-2"><span>{isNew ? '예상 연간 카드 거래액' : '연간 카드 거래액'}</span>
          <NumericFormat className={publicInputClass + ' md-numeric'} value={inputs.annualCardVolume ?? ''} thousandSeparator="," decimalScale={0} allowNegative={false} inputMode="numeric"
            isAllowed={({ floatValue }) => floatValue === undefined || Number.isSafeInteger(floatValue)}
            onValueChange={(v, source) => { if (source.source === 'event') update({ annualCardVolume: v.floatValue }); }} />
        </label>
        <p>카드로 결제된 거래액만 입력해요. 회사 전체 매출이나 계좌이체 등 다른 결제수단의 거래액은 제외해요.{isNew && ' 과거 매출이 없다면 예상 금액을 입력해요.'}</p>
        {!isNew && <label className="block space-y-2"><span>현재 수수료 부가세 기준</span>
          <p>입력한 현재 카드 수수료: <span className="md-numeric">{draft.currentFeeRate ? draft.currentFeeRate + '%' : '미입력'}</span></p>
          <select aria-label="현재 수수료 부가세 기준" className={publicInputClass} value={inputs.currentFeeVat ?? ''} onChange={e => update({ currentFeeVat: e.target.value === 'included' || e.target.value === 'excluded' ? e.target.value : undefined })}>
            <option value="">선택해주세요</option><option value="excluded">부가세 별도</option><option value="included">부가세 포함</option>
          </select>
        </label>}
        {!selectedPgId && response?.candidates.length ? <label className="block space-y-2"><span>비교 PG</span>
          <select aria-label="비교 PG" className={publicInputClass} disabled={busy} value={inputs.pgId ?? response.candidates[0].id}
            onChange={e => { const next = update({ pgId: e.target.value }); void calculate(next); }}>
            {response.candidates.map(pg => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
          </select></label> : null}
        <Button disabled={busy} className="min-h-11" onClick={() => void calculate()}>{busy ? '계산 중…' : '예상 절감액 확인하기'}</Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result?.status === 'calculated' && <><h3 className="mt-6 font-semibold">{isNew ? '표준 요율 대비 예상 절감액' : '현재 수수료 대비 예상 절감액'}</h3>
        <PositiveResult key={inputs.inputKey} annual={result.annual} monthly={result.monthly} memoryRef={memory} /></>}
      <p role="status" aria-live="polite" className={result?.status === 'calculated' ? 'sr-only' : 'mt-4'}>{resultMessage}</p>
      {result && result.status !== 'unavailable' && <dl className="space-y-2">
        <div><dt>비교 PG</dt><dd>{result.pgName}</dd></div>
        <div><dt>{result.revenueIsEstimate ? '예상 매출 기준 잠정 등급' : '잠정 등급'}</dt><dd>{MERCHANT_TIER_LABELS[result.provisionalTier]} · 승인 등급과 달라질 수 있어요</dd></div>
        <div><dt>연간 카드 거래액</dt><dd className="md-numeric">{won(result.annualCardVolume)}</dd></div>
        <div><dt>{isNew ? '표준 요율 → 제안 요율' : '현재 수수료 → 제안 요율'}</dt><dd><span className="md-numeric">{result.baselinePercent}% → {result.proposedPercent}%</span> (부가세 별도)</dd></div>
        <div><dt>적용 조건</dt><dd>{result.feeNote}</dd></div>
      </dl>}
      <p className={styles.note + ' mt-4'}>카드 외 결제수단, 가입비, 보증보험은 계산에서 제외했어요. 실제 요율은 PG 심사 후 확정돼요. 연간·월평균 금액은 각각 원 단위로 반올림해요.</p>
  </section>;
}
