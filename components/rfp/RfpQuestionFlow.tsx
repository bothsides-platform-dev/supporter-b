'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CurrentPgSelection, type CurrentPgOption } from './CurrentPgSelection';
import { IndustrySelection, INDUSTRY_SELECTION_GUIDANCE } from './IndustrySelection';
import styles from './guest-quote.module.css';
import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { InfoTip } from '@/components/ui/info-tip';
import { FieldError } from '@/components/primitives/FieldError';
import { useRfpDraft, useRfpDraftApi } from '@/lib/stores/rfp-draft-context';
import { MAXIMUM_PRICE_LABELS, MAXIMUM_PRICE_VALUES, SALES_METHOD_LABELS, SALES_METHOD_VALUES } from '@/lib/rfp/product-info';
import type { PublicIndustry } from '@/lib/types/pg-recommendation';
import { contentQuestions, questionAnswer } from './content-questions';
import { RfpStep2Content } from './RfpStep2Content';
import { normalizeWebsiteUrl } from '@/lib/validation/website-url';
import { WizardActionBar } from './WizardActionBar';
import { useBuyerDemo } from '@/lib/demo/buyer-demo-context';
import { tutorialRfpDraftSeed } from '@/lib/onboarding/tutorial-fixtures';

const choiceClass = 'flex cursor-pointer items-start gap-3 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-4 py-2.5 text-[16px] hover:bg-[var(--md-sys-color-surface-container)] has-[:checked]:border-[var(--md-sys-color-primary)] has-[:checked]:bg-[var(--md-sys-color-primary-container)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--md-sys-color-primary)]/50';

export function RfpQuestionFlow({ onBack, onNext, pgList = [], industryGroups = [], websiteRejected, onQuestionChange, onProgress, onAnswered, attachments, presentation = 'default', saving = false, mode = 'write' }: {
  onProgress?: (action: 'view' | 'next' | 'skip' | 'error', id: string, mode: 'write' | 'edit', answer?: string) => void;
  pgList?: CurrentPgOption[];
  mode?: 'write' | 'edit';
  presentation?: 'default' | 'public' | 'member'; saving?: boolean;
  onBack: () => void; onNext: () => void; industryGroups?: PublicIndustry[];
  websiteRejected?: string; onQuestionChange: () => void; onAnswered?: (id: string) => void; attachments?: import("react").ReactNode;
}) {
  const isQuotePresentation = presentation !== 'default';
  const inputPresentation = isQuotePresentation ? 'public' : 'default';
  const QuestionActions = presentation === 'member' ? WizardActionBar : 'div';
  const draftApi = useRfpDraftApi();
  const demo = useBuyerDemo();
  const draft = useRfpDraft();
  const questions = contentQuestions(draft, industryGroups);
  const index = Math.max(0, questions.findIndex(q => q.id === draft.contentQuestion));
  const question = questions[index];
  const titleInfoTerm = isQuotePresentation ? question.infoTerm : undefined;
  const [previousCount, setPreviousCount] = useState(questions.length);
  const [countAnnouncement, setCountAnnouncement] = useState('');
  if (previousCount !== questions.length) {
    setPreviousCount(questions.length);
    setCountAnnouncement(questions.length > previousCount
      ? `갱신 조건 질문 ${questions.length - previousCount}개를 추가했어요.` : '신규 계약에 필요한 질문만 보여드려요.');
  }
  const [attemptedId, setAttemptedId] = useState('');
  const id = useId();
  const [errorFocusRequest, setErrorFocusRequest] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const title = <h2 id={`${id}-heading`} ref={heading} tabIndex={-1} className="text-[length:var(--md-typescale-headline-medium-size)] font-[number:var(--md-typescale-headline-medium-weight)] leading-[var(--md-typescale-headline-medium-line-height)] tracking-[var(--md-typescale-headline-medium-tracking)] outline-none">{question.title}</h2>;
  const lastQuestion = useRef<string | null>(null);
  const progressView = useRef('');
  useEffect(() => {
    const key = `${question.id}:${mode}`;
    if (progressView.current !== key) { progressView.current = key; onProgress?.('view', question.id, mode); }
  }, [question.id, mode, onProgress]);
  const answers = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (answers.current) answers.current.scrollTop = 0;
    if (!isQuotePresentation || mode === 'edit' || (lastQuestion.current && lastQuestion.current !== question.id))
      heading.current?.scrollIntoView?.({ block: 'start' });
    lastQuestion.current = question.id;
    heading.current?.focus({ preventScroll: true });
    onQuestionChange();
  }, [question.id, onQuestionChange, isQuotePresentation, mode]);

  // Run after validation has rendered its aria-invalid state, including repeated attempts.
  useEffect(() => {
    if (!errorFocusRequest) return;
    const target = answers.current?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"]')
      ?? answers.current?.querySelector<HTMLElement>('button[aria-pressed], input:not([type="hidden"]):not(:disabled), textarea');
    target?.focus();
  }, [errorFocusRequest]);

  const move = (id: string) => { setAttemptedId(''); draft.setField('contentQuestion', id); };
  const previous = () => { if (mode === 'edit') onBack(); else if (index) move(questions[index - 1].id); else onBack(); };
  const next = (progression: 'next' | 'skip' = 'next') => {
    if (saving) return;
    if (question.id === 'website') {
      const current = draftApi.getState();
      const normalized = normalizeWebsiteUrl(current.websiteUrl);
      if (normalized !== current.websiteUrl) current.setField('websiteUrl', normalized);
    }
    const latest = contentQuestions(draftApi.getState(), industryGroups);
    const currentQuestion = latest.find(q => q.id === question.id) ?? question;
    const currentWebsiteRejected = question.id === 'website' && !!websiteRejected && draftApi.getState().websiteUrl.trim() === websiteRejected;
    if (!currentQuestion.valid || currentWebsiteRejected) { onProgress?.('error', question.id, mode); setAttemptedId(question.id); setErrorFocusRequest(value => value + 1); return; }
    if (progression === 'next') onProgress?.(progression, question.id, mode, questionAnswer(question.id, draftApi.getState(), industryGroups));
    else onProgress?.(progression, question.id, mode);
    onAnswered?.(question.id);
    if (mode === 'edit') {
      const missing = latest.find(q => !q.valid);
      if (missing) { move(missing.id); setAttemptedId(missing.id); setErrorFocusRequest(value => value + 1); }
      else onNext();
      return;
    }
    if (index < questions.length - 1) move(questions[index + 1].id);
    else {
      const missing = latest.find(q => !q.valid);
      if (missing) { move(missing.id); setAttemptedId(missing.id); setErrorFocusRequest(value => value + 1); }
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
  const currentAnswerIsEmpty = (() => {
    switch (question.id) {
      case 'website': return !draft.websiteUrl.trim();
      case 'industry': return !draft.industryGroupId && !draft.customIndustryName.trim();
      case 'products': return !draft.mainProducts.trim();
      case 'cash': return product.cashConvertible == null;
      case 'price': return !product.maximumPrice;
      case 'sales': return !product.salesMethods?.length;
      case 'contract': return !draft.contractType;
      case 'payment': return !draft.requiredPaymentMethods.length && !draft.customPaymentMethods.length;
      case 'annual': return !draft.annualPgVolume.trim();
      case 'title': return !draft.title.trim();
      default: return false;
    }
  })();
  const restoreExample = () => {
    switch (question.id) {
      case 'website': draft.setField('websiteUrl', tutorialRfpDraftSeed.websiteUrl); break;
      case 'industry': draftApi.setState({ industryGroupId: tutorialRfpDraftSeed.industryGroupId, industryMode: 'registered', customIndustryName: '' }); break;
      case 'products': draft.setField('mainProducts', tutorialRfpDraftSeed.mainProducts); break;
      case 'cash': draft.setField('productInfo', { ...product, cashConvertible: false }); break;
      case 'price': draft.setField('productInfo', { ...product, maximumPrice: 'under_100k' }); break;
      case 'sales': draft.setField('productInfo', { ...product, salesMethods: ['none'] }); break;
      case 'contract': draft.setField('contractType', tutorialRfpDraftSeed.contractType); break;
      case 'payment': draftApi.setState({ requiredPaymentMethods: tutorialRfpDraftSeed.requiredPaymentMethods, customPaymentMethods: [] }); break;
      case 'annual': draft.setField('annualPgVolume', tutorialRfpDraftSeed.annualPgVolume); break;
      case 'title': draft.setField('title', tutorialRfpDraftSeed.title); break;
    }
  };
  const productQuestion = ['sellers', 'cash', 'price', 'sales'].includes(question.id);
  const productError = productQuestion && attemptedId === question.id && !question.valid;
  const choiceAccessibility = { 'aria-invalid': productError || undefined, 'aria-describedby': productError ? `${id}-error` : undefined };
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
    <div onKeyDown={onKeyDown} className={isQuotePresentation ? `${styles.flow} ${presentation === 'member' ? styles.memberFlow : ''}` : "w-full lg:flex lg:h-full lg:min-h-0 lg:flex-col"}>
      <div className={isQuotePresentation ? styles.questionHeader : "mx-auto w-full max-w-xl px-4 pb-3 pt-3 sm:px-6 lg:shrink-0 lg:border-b lg:border-[var(--md-sys-color-outline-variant)] lg:px-0 lg:pt-4"}>
        {isQuotePresentation && <>
          <div className={styles.progressLabel}>
            <span>{question.section}</span>
            <span className="md-numeric" aria-label="질문 진행률">{index + 1} / {questions.length}</span>
            {question.optional && <Chip label="선택" />}
          </div>
          <div role="progressbar" aria-label="작성 진행" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index + 1} className={styles.progressTrack}>
            <span style={{ transform: `scaleX(${(index + 1) / questions.length})` }} />
          </div>
          <p role="status" className="sr-only">{countAnnouncement}</p>
        </>}
        {/* ⓘ 는 제목 밖 형제로 둔다 — 제목 안에 있으면 제목·답변 그룹의 접근성 이름에 '… 설명'이 붙는다.
            flex 로 묶어 제목이 줄 끝에 꽉 차도 ⓘ 만 다음 줄로 떨어지지 않게 한다. */}
        {titleInfoTerm ? <div className="flex items-end gap-1">
          {title}
          {/* 줄높이 토큰은 단위 없는 수라 height 에 직접 못 쓴다 — 제목과 같은 글자 크기·줄높이를 주고 1lh 로 맞춘다.
              답변 영역 밖이라 .answers 의 44px 터치 영역을 못 받으므로 ::after 로 레이아웃 변화 없이 넓힌다. */}
          <span className="flex h-lh shrink-0 items-center text-[length:var(--md-typescale-headline-medium-size)] leading-[var(--md-typescale-headline-medium-line-height)]"><InfoTip term={titleInfoTerm} className="relative after:absolute after:-inset-[13px] after:content-['']" /></span>
        </div> : title}
        {guidance && <p id={`${id}-guidance`} className="mt-2 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">{guidance}</p>}
      </div>
      <div ref={answers} data-testid="rfp-question-scroll" className={isQuotePresentation ? styles.answers : "mx-auto w-full max-w-xl px-4 pb-6 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-1 lg:pt-5 lg:pb-10"}>
      {demo && !question.valid && currentAnswerIsEmpty && <Button className="mb-3 min-h-11" variant="outlined" data-coachmark="demo-question-example" onClick={restoreExample}>예시 답변 넣기</Button>}
      <div role="group" aria-labelledby={`${id}-heading`} aria-describedby={guidance ? `${id}-guidance` : undefined}>
        {question.id === 'current-pgs' ? <CurrentPgSelection presentation={inputPresentation} pgList={pgList} attempted={attemptedId === question.id} /> : question.id === 'attachments' && attachments ? attachments : question.id === 'industry' ? (
          <IndustrySelection presentation={inputPresentation} groups={industryGroups} attempted={attemptedId === question.id} showGuidance={false} />
        ) : question.id === 'sellers' || question.id === 'cash' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map(value => {
                const field = question.id === 'sellers' ? 'hasMarketplaceSellers' : 'cashConvertible';
                return <label key={String(value)} className={choiceClass}><input {...choiceAccessibility} type="radio" name={question.id} checked={product[field] === value} onChange={() => draft.setField('productInfo', { ...product, [field]: value })} className="mt-1 accent-[var(--md-sys-color-primary)]" />{value ? '네' : '아니요'}</label>;
              })}
            </div>
          </>
        ) : question.id === 'price' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {MAXIMUM_PRICE_VALUES.map(value => <label key={value} className={choiceClass}><input {...choiceAccessibility} type="radio" name="maximumPrice" checked={product.maximumPrice === value} onChange={() => draft.setField('productInfo', { ...product, maximumPrice: value })} className="mt-1 accent-[var(--md-sys-color-primary)]" /><span className="md-numeric">{MAXIMUM_PRICE_LABELS[value]}</span></label>)}
          </div>
        ) : question.id === 'sales' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {SALES_METHOD_VALUES.map(value => <label key={value} className={choiceClass}><input {...choiceAccessibility} type="checkbox" checked={product.salesMethods?.includes(value) ?? false} onChange={event => {
              const values = product.salesMethods ?? [];
              const salesMethods = !event.target.checked ? values.filter(v => v !== value) : value === 'none' ? ['none' as const] : [...values.filter(v => v !== 'none'), value];
              draft.setField('productInfo', { ...product, salesMethods });
            }} className="mt-1 accent-[var(--md-sys-color-primary)]" />{SALES_METHOD_LABELS[value]}</label>)}
          </div>
        ) : <RfpStep2Content presentation={inputPresentation} question={question.id} onBack={onBack} onNext={() => next()} industryGroups={industryGroups} showFieldErrors={attemptedId === question.id} websiteRejected={websiteRejected} />}
      </div>
      {productError && <div id={`${id}-error`}><FieldError error="답변을 선택하면 다음 질문으로 넘어갈 수 있어요" /></div>}
      </div>
      {isQuotePresentation ? <QuestionActions role="group" aria-label="작성 이동" className={`${styles.actions} ${presentation === 'member' ? styles.memberActions : ''}`}>
        <Button className={styles.previous} variant="outlined" disabled={saving} onClick={previous}>{mode === 'edit' ? '취소' : index === 0 && presentation === 'public' ? '홈으로' : '이전'}</Button>
        {mode === 'write' && question.optional && <Button className={styles.skip} variant="text" disabled={saving} onClick={() => {
          if (presentation === 'member' && question.id === 'sellers') {
            const { hasMarketplaceSellers: _omitted, ...rest } = product;
            draft.setField('productInfo', rest);
          }
          next('skip');
        }}>지금은 건너뛰어요</Button>}
        <Button className={styles.next} disabled={saving} onClick={() => next()}>{saving ? '저장 중…' : mode === 'edit' ? '수정 완료' : index === questions.length - 1 ? presentation === 'member' ? '내용 확인하기' : '작성 마치기' : '다음'}</Button>
      </QuestionActions> : <WizardActionBar className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-3">
        <Button variant="outlined" onClick={previous}>이전</Button>
        <span className="flex items-baseline gap-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          <span className="md-numeric" aria-label="질문 진행률">{index + 1} / {questions.length}</span>
        </span>
        <div className="flex items-center gap-3">
          {question.id === 'sellers' && <Button variant="text" onClick={() => { const { hasMarketplaceSellers: _omitted, ...rest } = product; draft.setField('productInfo', rest); next('skip'); }}>건너뛰기</Button>}
          <Button className={demo ? 'min-h-11 sm:min-h-8' : undefined} data-coachmark="demo-question-next" onClick={() => next()}>{index === questions.length - 1 ? '내용 확인하기' : '다음'}</Button>
        </div>
      </WizardActionBar>}
    </div>
  );
}
