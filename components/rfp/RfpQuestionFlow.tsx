'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { IndustrySelection, INDUSTRY_SELECTION_GUIDANCE } from './IndustrySelection';
import { Button } from '@/components/primitives/Button';
import { FieldError } from '@/components/primitives/FieldError';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { MAXIMUM_PRICE_LABELS, MAXIMUM_PRICE_VALUES, SALES_METHOD_LABELS, SALES_METHOD_VALUES } from '@/lib/rfp/product-info';
import type { PgRecommendationGroup } from '@/lib/types/pg-recommendation';
import { contentQuestions } from './content-questions';
import { RfpStep2Content } from './RfpStep2Content';
import { normalizeWebsiteUrl } from '@/lib/validation/website-url';
import { WizardActionBar } from './WizardActionBar';

const choiceClass = 'flex cursor-pointer items-start gap-3 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-[16px] hover:bg-[var(--md-sys-color-surface-container)] has-[:checked]:border-[var(--md-sys-color-primary)] has-[:checked]:bg-[var(--md-sys-color-primary-container)]';

export function RfpQuestionFlow({ onBack, onNext, industryGroups = [], websiteRejected, onQuestionChange }: {
  onBack: () => void; onNext: () => void; industryGroups?: PgRecommendationGroup[];
  websiteRejected?: string; onQuestionChange: () => void;
}) {
  const draft = useRfpDraftStore();
  const questions = contentQuestions(draft, industryGroups);
  const index = Math.max(0, questions.findIndex(q => q.id === draft.contentQuestion));
  const question = questions[index];
  const [attemptedId, setAttemptedId] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const answers = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (answers.current) answers.current.scrollTop = 0;
    heading.current?.scrollIntoView?.({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
    onQuestionChange();
  }, [question.id, onQuestionChange]);

  const move = (id: string) => { setAttemptedId(''); draft.setField('contentQuestion', id); };
  const previous = () => { if (index) move(questions[index - 1].id); else onBack(); };
  const next = () => {
    if (question.id === 'website') {
      const current = useRfpDraftStore.getState();
      const normalized = normalizeWebsiteUrl(current.websiteUrl);
      if (normalized !== current.websiteUrl) current.setField('websiteUrl', normalized);
    }
    const latest = contentQuestions(useRfpDraftStore.getState(), industryGroups);
    const currentQuestion = latest.find(q => q.id === question.id) ?? question;
    const currentWebsiteRejected = question.id === 'website' && !!websiteRejected && useRfpDraftStore.getState().websiteUrl.trim() === websiteRejected;
    if (!currentQuestion.valid || currentWebsiteRejected) { setAttemptedId(question.id); return; }
    if (index < questions.length - 1) move(questions[index + 1].id);
    else {
      const missing = questions.find(q => !q.valid);
      if (missing) { move(missing.id); setAttemptedId(missing.id); }
      else onNext();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !event.currentTarget.contains(target)) return;
    if (target.closest('textarea, select, button, a, [contenteditable="true"], [role="button"], [role="link"], [role="tab"], [role="switch"], [role="radio"], [role="checkbox"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="option"]')) return;
    event.preventDefault();
    if (event.shiftKey) previous();
    else next();
  };
  const product = draft.productInfo;
  const productQuestion = ['sellers', 'cash', 'price', 'sales'].includes(question.id);
  const guidance = question.id === 'sellers'
    ? '다른 판매자가 내 홈페이지에 입점해 상품을 판매하는 경우예요.'
    : question.id === 'cash'
      ? '상품권, 교환권, 게임머니, 충전 포인트, 귀금속처럼 현금으로 바꾸기 쉬운 상품이에요.'
      : question.id === 'sales'
        ? '해당하는 방식을 모두 선택해요. 해당하는 방식이 없으면 ‘해당 없음’을 선택해요.'
        : question.id === 'payment'
          ? '여러 개 선택할 수 있어요'
        : question.id === 'industry'
          ? INDUSTRY_SELECTION_GUIDANCE
          : null;
  return (
    <div onKeyDown={onKeyDown} className="w-full lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="mx-auto w-full max-w-xl px-4 pb-5 pt-3 sm:px-6 lg:shrink-0 lg:border-b lg:border-[var(--md-sys-color-outline-variant)] lg:px-0 lg:pt-5">
        <div className="mb-5 flex items-center justify-between text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          <span>견적 내용{question.optional ? '(선택)' : ''}</span>
          <span className="md-numeric" aria-label="질문 진행률">{index + 1} / {questions.length}</span>
        </div>
        <h2 ref={heading} tabIndex={-1} className="text-[length:var(--md-typescale-headline-medium-size)] font-[number:var(--md-typescale-headline-medium-weight)] leading-[var(--md-typescale-headline-medium-line-height)] tracking-[var(--md-typescale-headline-medium-tracking)] outline-none">{question.title}</h2>
        {guidance && <p className="mt-4 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">{guidance}</p>}
      </div>
      <div ref={answers} data-testid="rfp-question-scroll" className="mx-auto w-full max-w-xl px-4 pb-6 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-0 lg:pt-5 lg:pb-10">
      <div role="group" aria-label={question.title}>
        {question.id === 'industry' ? (
          <IndustrySelection groups={industryGroups} attempted={attemptedId === question.id} showGuidance={false} />
        ) : question.id === 'sellers' || question.id === 'cash' ? (
          <>
            <div className="space-y-3">
              {[true, false].map(value => {
                const field = question.id === 'sellers' ? 'hasMarketplaceSellers' : 'cashConvertible';
                return <label key={String(value)} className={choiceClass}><input type="radio" name={question.id} checked={product[field] === value} onChange={() => draft.setField('productInfo', { ...product, [field]: value })} className="mt-1 accent-[var(--md-sys-color-primary)]" />{value ? '네' : '아니요'}</label>;
              })}
            </div>
          </>
        ) : question.id === 'price' ? (
          <div className="space-y-2">
            {MAXIMUM_PRICE_VALUES.map(value => <label key={value} className={choiceClass}><input type="radio" name="maximumPrice" checked={product.maximumPrice === value} onChange={() => draft.setField('productInfo', { ...product, maximumPrice: value })} className="mt-1 accent-[var(--md-sys-color-primary)]" /><span className="md-numeric">{MAXIMUM_PRICE_LABELS[value]}</span></label>)}
          </div>
        ) : question.id === 'sales' ? (
          <div className="space-y-3">
            {SALES_METHOD_VALUES.map(value => <label key={value} className={choiceClass}><input type="checkbox" checked={product.salesMethods?.includes(value) ?? false} onChange={event => {
              const values = product.salesMethods ?? [];
              const salesMethods = !event.target.checked ? values.filter(v => v !== value) : value === 'none' ? ['none' as const] : [...values.filter(v => v !== 'none'), value];
              draft.setField('productInfo', { ...product, salesMethods });
            }} className="mt-1 accent-[var(--md-sys-color-primary)]" />{SALES_METHOD_LABELS[value]}</label>)}
          </div>
        ) : <RfpStep2Content question={question.id} onBack={onBack} onNext={next} industryGroups={industryGroups} showFieldErrors={attemptedId === question.id} websiteRejected={websiteRejected} />}
      </div>
      {productQuestion && attemptedId === question.id && !question.valid && <FieldError error="답변을 선택하면 다음 질문으로 넘어갈 수 있어요" />}
      </div>
      <WizardActionBar className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-3">
        <Button variant="outlined" onClick={previous}>이전</Button>
        <span className="hidden text-[13px] text-[var(--md-sys-color-on-surface-variant)] lg:block">Enter로 다음, Shift+Enter로 이전</span>
        <div className="flex items-center gap-3">
          {question.id === 'sellers' && <Button variant="text" onClick={() => { const { hasMarketplaceSellers: _omitted, ...rest } = product; draft.setField('productInfo', rest); move(questions[index + 1].id); }}>건너뛰기</Button>}
          <Button onClick={next}>{index === questions.length - 1 ? '내용 확인하기' : '다음'}</Button>
        </div>
      </WizardActionBar>
    </div>
  );
}
