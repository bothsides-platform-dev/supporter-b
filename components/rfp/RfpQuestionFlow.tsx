'use client';

import { useEffect, useRef, useState } from 'react';
import { IndustrySelection } from './IndustrySelection';
import { Button } from '@/components/primitives/Button';
import { FieldError } from '@/components/primitives/FieldError';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { MAXIMUM_PRICE_LABELS, MAXIMUM_PRICE_VALUES, SALES_METHOD_LABELS, SALES_METHOD_VALUES } from '@/lib/rfp/product-info';
import type { PgRecommendationGroup } from '@/lib/types/pg-recommendation';
import { contentQuestions } from './content-questions';
import { RfpStep2Content } from './RfpStep2Content';

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
  const rejected = question.id === 'website' && !!websiteRejected && draft.websiteUrl.trim() === websiteRejected;
  useEffect(() => {
    heading.current?.scrollIntoView?.({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
    onQuestionChange();
  }, [question.id, onQuestionChange]);

  const move = (id: string) => { setAttemptedId(''); draft.setField('contentQuestion', id); };
  const next = () => {
    if (!question.valid || rejected) { setAttemptedId(question.id); return; }
    if (index < questions.length - 1) move(questions[index + 1].id);
    else {
      const missing = questions.find(q => !q.valid);
      if (missing) { move(missing.id); setAttemptedId(missing.id); }
      else onNext();
    }
  };
  const product = draft.productInfo;
  const productQuestion = ['sellers', 'cash', 'price', 'sales'].includes(question.id);
  return (
    <div className="mx-auto w-full max-w-xl py-3 sm:py-8">
      <div className="mb-8 flex items-center justify-between text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        <span>견적 내용{question.optional ? ' · 선택' : ''}</span>
        <span className="md-numeric" aria-label="질문 진행률">{index + 1} / {questions.length}</span>
      </div>
      <h2 ref={heading} tabIndex={-1} className="mb-8 text-[length:var(--md-typescale-headline-medium-size)] font-[number:var(--md-typescale-headline-medium-weight)] leading-[var(--md-typescale-headline-medium-line-height)] tracking-[var(--md-typescale-headline-medium-tracking)] outline-none">{question.title}</h2>
      <div role="group" aria-label={question.title}>
        {question.id === 'industry' ? (
          <IndustrySelection groups={industryGroups} attempted={attemptedId === question.id} />
        ) : question.id === 'sellers' || question.id === 'cash' ? (
          <>
            <p className="mb-5 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
              {question.id === 'sellers' ? '다른 판매자가 내 홈페이지에 입점해 상품을 판매하는 경우예요.' : '상품권·교환권·게임머니·충전 포인트·귀금속처럼 현금으로 바꾸기 쉬운 상품이에요.'}
            </p>
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
            <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">해당하는 방식을 모두 선택해요. 해당하는 방식이 없으면 ‘해당 없음’을 선택해요.</p>
            {SALES_METHOD_VALUES.map(value => <label key={value} className={choiceClass}><input type="checkbox" checked={product.salesMethods?.includes(value) ?? false} onChange={event => {
              const values = product.salesMethods ?? [];
              const salesMethods = !event.target.checked ? values.filter(v => v !== value) : value === 'none' ? ['none' as const] : [...values.filter(v => v !== 'none'), value];
              draft.setField('productInfo', { ...product, salesMethods });
            }} className="mt-1 accent-[var(--md-sys-color-primary)]" />{SALES_METHOD_LABELS[value]}</label>)}
          </div>
        ) : <RfpStep2Content question={question.id} onBack={onBack} onNext={next} industryGroups={industryGroups} showFieldErrors={attemptedId === question.id} websiteRejected={websiteRejected} />}
      </div>
      {productQuestion && attemptedId === question.id && !question.valid && <FieldError error="답변을 선택하면 다음 질문으로 넘어갈 수 있어요" />}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--md-sys-color-outline-variant)] pt-5">
        <Button variant="outlined" onClick={() => index ? move(questions[index - 1].id) : onBack()}>이전</Button>
        <div className="flex items-center gap-3">
          {question.id === 'sellers' && <Button variant="text" onClick={() => { const { hasMarketplaceSellers: _omitted, ...rest } = product; draft.setField('productInfo', rest); move(questions[index + 1].id); }}>건너뛰기</Button>}
          <Button onClick={next}>{index === questions.length - 1 ? '내용 확인하기' : '다음'}</Button>
        </div>
      </div>
    </div>
  );
}
