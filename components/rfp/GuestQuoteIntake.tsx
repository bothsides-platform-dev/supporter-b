'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { publicInputClass } from '@/components/forms/inputs';
import { isWebsiteValid } from '@/lib/rfp/required-fields';
import { normalizeWebsiteUrl } from '@/lib/validation/website-url';
import { SOLUTION_OPTIONS } from '@/lib/rfp/solutions';
import { SALES_METHOD_LABELS, SALES_METHOD_VALUES } from '@/lib/rfp/product-info';
import type { PublicIndustry } from '@/lib/types/pg-recommendation';
import type { Suggestion } from '@/lib/guest-rfp/suggestions';
import { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';
import styles from './guest-quote.module.css';
const labels: Record<Suggestion['field'], string> = {
  companyName: '회사명', mainProducts: '주요 상품', industryGroupId: '업종', currentSolution: '운영 솔루션',
  deliveryServicePeriod: '배송·서비스 기간', hasMarketplaceSellers: '입점 판매자', cashConvertible: '환금성 상품', salesMethods: '판매 방식',
};
export function GuestQuoteIntake({ quote, industryGroups, onConfirmed }: {
  quote: GuestQuoteController; industryGroups: PublicIndustry[]; onConfirmed?: () => void;
}) {
  const context = useSyncExternalStore(quote.subscribe, quote.snapshot, quote.snapshot);
  const draft = useStore(quote.session.store);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(context.stage);
  const pending = context.analysisState === 'pending';
  useEffect(() => {
    if (previousStage.current !== context.stage) heading.current?.scrollIntoView?.({ block: 'start' });
    previousStage.current = context.stage;
    heading.current?.focus({ preventScroll: true });
  }, [context.stage]);
  const run = (action: () => void) => {
    try { action(); setError(''); } catch { setError('초안을 저장하지 못했어요. 브라우저 저장 공간을 확인하고 다시 시도해요.'); }
  };
  const analyze = (kind: 'business' | 'website', retry = false) => {
    void quote.analyze(kind, retry).catch(() => setError('확인한 정보만 채웠어요. 나머지는 직접 입력해주세요.'));
  };
  const websiteReady = () => {
    const url = normalizeWebsiteUrl(draft.websiteUrl.trim());
    if (!isWebsiteValid(url)) { setError('홈페이지 주소를 확인해요. 예: example.com'); return false; }
    run(() => quote.website(url));
    return true;
  };
  if (context.stage === 'questions' || context.stage === 'complete') return null;
  const title = context.stage === 'business' ? '사업자등록번호를 알려주세요'
    : context.stage === 'website' ? '어떤 홈페이지에서 판매하나요?' : '입력할 내용을 함께 확인해요';
  const suggestions = quote.suggestions();
  const display = (field: Suggestion['field']) => {
    const current = quote.value(field);
    return context.userFields.includes(field) || current !== undefined && current !== '' && !(Array.isArray(current) && !current.length)
      ? current : suggestions.find(s => s.field === field)?.value;
  };
  const fields = [...new Set<Suggestion['field']>(['companyName', ...suggestions.map(s => s.field)])];
  return <form className={styles.flow} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    if (context.stage === 'business') {
      if (!/^\d{10}$/.test(context.bizNo)) { setError('사업자등록번호 10자리를 입력하거나 건너뛰어요.'); return; }
      analyze('business');
    } else if (context.stage === 'website') {
      if (!websiteReady()) return;
      analyze('website');
    } else run(() => { quote.confirm(); onConfirmed?.(); });
  }}>
    <div className={styles.questionHeader}>
      <div className={styles.progressLabel}><span>사업 정보</span><Chip label={context.stage === 'business' ? '선택' : '확인'} /></div>
      <h2 ref={heading} tabIndex={-1} className="text-[length:var(--md-typescale-headline-medium-size)] font-[number:var(--md-typescale-headline-medium-weight)] leading-[var(--md-typescale-headline-medium-line-height)] tracking-[var(--md-typescale-headline-medium-tracking)] outline-none">{title}</h2>
      <p className="mt-3 text-[16px] text-[var(--md-sys-color-on-surface-variant)]">{context.stage === 'business'
        ? '회사 정보를 먼저 확인해요. 지금은 건너뛰어도 괜찮아요.'
        : context.stage === 'website' ? '홈페이지의 공개 정보로 답변을 준비해요. 직접 작성할 수도 있어요.'
          : '맞는 정보만 선택해요. 확인한 항목은 다시 묻지 않아요.'}</p>
    </div>
    <div className={styles.answers + ' space-y-6'}>
      {context.stage === 'business' ? <label className="block space-y-2">
        <span>사업자등록번호</span><input className={publicInputClass + ' md-numeric'} inputMode="numeric" autoComplete="off" maxLength={12}
          value={context.bizNo} onChange={e => run(() => quote.business(e.target.value.replace(/\D/g, '').slice(0, 10)))} />
      </label> : context.stage === 'website' ? <label className="block space-y-2">
        <span>사업 운영 홈페이지</span><input className={publicInputClass} inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={500}
          value={draft.websiteUrl} onChange={e => run(() => quote.website(e.target.value))} placeholder="example.com" />
      </label> : <>
        {context.analysisState !== 'complete' && <p role="status">확인한 정보만 채웠어요. 나머지는 직접 입력해주세요.</p>}
        {context.businessResult?.business?.status && <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
          사업자 상태: {{ active: '정상 영업', suspended: '휴업', closed: '폐업' }[context.businessResult.business.status]}
          {context.businessResult.business.taxType && ' · ' + { general: '일반과세', simple: '간이과세', exempt: '면세' }[context.businessResult.business.taxType]}
          {' '}· 가입할 때 다시 확인해요.
        </p>}
        {fields.map(field => {
          const suggestion = suggestions.find(s => s.field === field);
          const value = display(field);
          const inputId = 'quote-confirm-' + field;
          return <div key={field} className="space-y-2 border-b border-[var(--md-sys-color-outline-variant)] pb-5">
            <label htmlFor={inputId} className="block font-medium">{labels[field]}</label>
            {field === 'industryGroupId' || field === 'currentSolution' ? <select id={inputId} className={publicInputClass} value={String(value ?? '')} onChange={e => run(() => quote.edit(field, e.target.value))}>
              <option value="">직접 선택할게요</option>
              {(field === 'industryGroupId' ? industryGroups.map(g => ({ value: g.id, label: g.name })) : SOLUTION_OPTIONS).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select> : field === 'cashConvertible' || field === 'hasMarketplaceSellers' ? <select id={inputId} className={publicInputClass} value={String(value)} onChange={e => run(() => quote.edit(field, e.target.value === 'true'))}>
              <option value="true">네</option><option value="false">아니요</option>
            </select> : field === 'salesMethods' ? <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="sr-only">판매 방식</legend>
              {SALES_METHOD_VALUES.map(method => <label key={method} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={Array.isArray(value) && value.includes(method)} onChange={e => run(() => {
                const current = Array.isArray(value) ? value : [];
                quote.edit(field, !e.target.checked ? current.filter(v => v !== method) : method === 'none' ? ['none'] : [...current.filter(v => v !== 'none'), method]);
              })} />{SALES_METHOD_LABELS[method]}</label>)}
            </fieldset> : <input id={inputId} className={publicInputClass} maxLength={field === 'mainProducts' ? 200 : 100} value={String(value ?? '')} onChange={e => run(() => quote.edit(field, e.target.value))} />}
            {suggestion && <>
              <p className="break-words text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                {suggestion.source === 'business' ? '사업자 조회' : suggestion.source === 'ai' ? '홈페이지 내용 정리' : '홈페이지 공개 정보'}: {suggestion.evidence}
                {suggestion.sourceUrl && <> · <a className="underline" href={suggestion.sourceUrl} target="_blank" rel="noopener noreferrer">출처 보기</a></>}
              </p>
              <label className="flex min-h-11 items-center gap-2 text-[14px]"><input type="checkbox"
                checked={!context.rejectedFields?.includes(field)} onChange={e => run(() => quote.update({ rejectedFields: e.target.checked
                  ? context.rejectedFields?.filter(f => f !== field) : [...(context.rejectedFields ?? []), field] }))} />이 내용을 사용할게요</label>
            </>}
          </div>;
        })}
        <Button type="button" variant="text" onClick={() => analyze('website', true)}>홈페이지를 다시 확인해요</Button>
      </>}
      {pending && <p role="status" className="text-[16px]">공개 정보를 확인하고 있어요…</p>}
      {error && <p role="alert" className="text-[var(--md-sys-color-error)]">{error}
        <Button type="button" variant="text" onClick={() => run(() => quote.session.save())}>다시 저장해요</Button>
      </p>}
    </div>
    <div className={styles.actions}>
      <Button type="button" variant="outlined" className={styles.previous} onClick={() => run(() => {
        quote.stop(); quote.update({ stage: context.stage === 'review' ? 'website' : 'business', analysisState: 'idle' });
      })} disabled={context.stage === 'business'}>이전</Button>
      {context.stage === 'business' && !pending && <Button type="button" variant="text" className={styles.skip} onClick={() => run(() => quote.manual('business'))}>지금은 건너뛸게요</Button>}
      {(pending || context.stage === 'website') && <Button type="button" variant="text" className={styles.skip} onClick={() => {
        if (context.stage !== 'business' && !websiteReady()) return;
        run(() => quote.manual(context.stage === 'business' ? 'business' : 'website'));
      }}>직접 입력할게요</Button>}
      <Button type="submit" className={styles.next} disabled={pending}>{pending ? '확인 중…' : context.stage === 'review' ? '확인한 내용으로 계속할게요' : '다음'}</Button>
    </div>
  </form>;
}

