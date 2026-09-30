// components/rfp/RfpStep4Review.tsx
'use client';

import { cleanIndustryName } from '@/lib/rfp/industry-selection';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BusinessDeadlineField } from './BusinessDeadlineField';
import { productInfoRows, productInfoSchema } from '@/lib/rfp/product-info';
import { RfpMatchingSelection } from './RfpMatchingSelection';
import { MATCHING_ERRORS } from '@/lib/rfp/pg-matching';
import { Button } from '@/components/primitives/Button';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/primitives/Checkbox';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { formatSize, formatKrwReadable, formatKrwField, formatFeeRateDisplay, formatBizNoDisplay } from '@/lib/utils/format';
import { CONTRACT_TYPE_LABELS } from '@/lib/types/rfp';
import type { BizProfile } from '@/lib/types/biz-profile';
import { RequiredMark } from './RequiredMark';
import { isDeadlineValid, markerState } from '@/lib/rfp/required-fields';
import { FieldError } from '@/components/primitives/FieldError';
import { Divider } from '@/components/primitives/Divider';
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
import { formatSolutionSummary } from '@/lib/rfp/solutions';
import { formatRequestedPaymentMethods } from '@/lib/rfp/payment-methods';
import { RfpStep3PgSelect, type PgWorkspace } from './RfpStep3PgSelect';
import type { PgRecommendationGroup } from '@/lib/types/pg-recommendation';
import { DEADLINE_ERROR_MESSAGES } from '@/lib/rfp/deadline-errors';
import { sampleBusinessCalendar } from '@/lib/rfp/sample-calendar';
import { WizardActionBar } from './WizardActionBar';
import { useIsLgUp } from '@/lib/hooks/useIsLgUp';

/** 좁은 화면의 맞춤 상담 최종 확인은 PG 선택(pg)과 마감일·요약(review)을 한 화면씩 보여준다. */
export type ReviewPane = 'pg' | 'review';

type Props = {
  sampleMode?: boolean;
  matching?: boolean;
  pgList: PgWorkspace[];
  industryGroups?: PgRecommendationGroup[];
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  workspaceName?: string;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  serverError: string;
  showFieldErrors?: boolean;
  persistentActions?: boolean;
};

function ReviewRow({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  // 최종 확인 화면 — 빈 값도 숨기지 않고 '미입력'으로 노출해 누락을 알아챌 수 있게 한다.
  const empty = !value;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5 last:border-0">
      <span className="md-label-small shrink-0 text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 break-words text-right text-[13px]',
          numeric && 'md-numeric',
          empty
            ? 'text-[var(--md-sys-color-on-surface-variant)]'
            : 'text-[var(--md-sys-color-on-surface)]',
        )}
      >
        {value || '미입력'}
      </span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <Divider />
    </div>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  ...MATCHING_ERRORS,
  ...DEADLINE_ERROR_MESSAGES,
  INVALID_INPUT: '입력 값을 확인해주세요.',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다. 다시 시도해주세요.',
};

export function RfpStep4Review(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [attempted, setAttempted] = useState(false);
  const [deadlineReady, setDeadlineReady] = useState(false);
  const pgCount = useRfpDraftStore(s => s.allowedPgWorkspaceIds.length);
  const isLg = useIsLgUp();
  const [pane, setPane] = useState<ReviewPane>('pg');
  const split = !!props.matching && !!props.persistentActions && !isLg;
  useEffect(() => {
    if (props.persistentActions) rootRef.current?.focus({ preventScroll: true });
  }, [props.persistentActions]);
  const goBack = () => {
    if (props.submitting) return;
    if (split && pane === 'review') setPane('pg');
    else props.onBack();
  };
  const onShortcutBack = (event: KeyboardEvent<HTMLElement>) => {
    if (props.sampleMode || props.submitting || event.key !== 'Enter' || !event.shiftKey || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    goBack();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.currentTarget.contains(event.target) || event.target.closest('button, a, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="option"]')) return;
    onShortcutBack(event);
  };
  const review = <ReviewContent {...props} attempted={attempted} deadlineReady={deadlineReady} onDeadlineReady={setDeadlineReady} onAttempt={() => setAttempted(true)} />;
  const content = props.matching
    ? <RfpMatchingSelection onBack={props.persistentActions ? undefined : props.onBack} industryGroups={props.industryGroups ?? []} pane={split ? pane : undefined}>{review}</RfpMatchingSelection>
    : review;
  return <>
    <div ref={rootRef} tabIndex={props.persistentActions ? -1 : undefined} onKeyDown={onKeyDown}>{content}</div>
    {props.persistentActions && <ReviewActions {...props} onBack={goBack} onShortcutBack={onShortcutBack} pgCount={pgCount} deadlineReady={deadlineReady} onAttempt={() => setAttempted(true)} pane={split ? pane : undefined} onPaneChange={setPane} />}
  </>;
}

function ReviewActions({ onBack, onSubmit, submitting, matching, sampleMode, pgCount, deadlineReady, onAttempt, persistentActions, pane, onPaneChange, onShortcutBack }: Props & { pgCount: number; deadlineReady: boolean; onAttempt: () => void; pane?: ReviewPane; onPaneChange?: (pane: ReviewPane) => void; onShortcutBack?: (event: KeyboardEvent<HTMLElement>) => void }) {
  return <WizardActionBar className={persistentActions ? 'mx-auto flex w-full max-w-3xl items-center justify-between gap-3' : 'flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]'}>
    <Button type="button" variant="outlined" size="md" onClick={onBack} onKeyDown={onShortcutBack} disabled={submitting}>이전</Button>
    {pane === 'pg' ? <Button type="button" size="lg" disabled={pgCount === 0} onClick={() => onPaneChange?.('review')} onKeyDown={onShortcutBack}>다음</Button> : <Button
      data-demo-cursor
      data-coachmark="tutorial-wizard-submit"
      type="button"
      size="lg"
      disabled={submitting || (matching && pgCount === 0)}
      onKeyDown={onShortcutBack}
      onClick={() => { onAttempt(); if (!sampleMode && !deadlineReady) return; void onSubmit(); }}
    >
      {submitting ? '보내는 중…' : matching ? '상담 요청하기' : pgCount > 0 ? `${pgCount}개 PG사에 보내기` : '보내기'}
    </Button>}
  </WizardActionBar>;
}

function ReviewContent({
  sampleMode = false,
  matching = false,
  pgList,
  industryGroups = [],
  bizProfile,
  workspaceName,
  serverError,
  showFieldErrors,
  attempted,
  deadlineReady,
  onDeadlineReady,
  onAttempt,
  persistentActions,
  ...actions
}: Props & { attempted: boolean; deadlineReady: boolean; onDeadlineReady: (ready: boolean) => void; onAttempt: () => void }) {
  const draft = useRfpDraftStore();
  const product = productInfoSchema.safeParse(draft.productInfo);
  const selectedIndustry = industryGroups.find((group) => group.id === draft.industryGroupId);
  // 렌더마다 새 객체면 BusinessDeadlineField 의 effect 가 매번 다시 돈다.
  const [sampleCalendar] = useState(() => sampleMode ? sampleBusinessCalendar(new Date()) : undefined);

  const pgCount = draft.allowedPgWorkspaceIds.length;
  const deadlineError = (attempted || !!showFieldErrors) && (!draft.deadline || (!sampleMode && !deadlineReady));
  const paymentMethodSummary =
    formatRequestedPaymentMethods(draft.requiredPaymentMethods, draft.customPaymentMethods) ?? '';

  const solutionSummary =
    formatSolutionSummary(draft.currentSolution, draft.currentSolutionDetail) ?? '';

  const industryName = draft.industryMode === 'custom' ? cleanIndustryName(draft.customIndustryName) : selectedIndustry?.name ?? '';
  const fullSummary = (
    <>
      {/* 견적 요청 요약 */}
      <div>
        <SectionHeader label="견적 요청 요약" />
        <div className="border border-[var(--md-sys-color-outline-variant)]">
          <ReviewRow label="상호명" value={workspaceName ?? ''} />
          <ReviewRow label="사업자번호" value={bizProfile?.bizNo ? formatBizNoDisplay(bizProfile.bizNo) : ''} numeric />
          <ReviewRow
            label="견적 유형"
            value={draft.contractType ? CONTRACT_TYPE_LABELS[draft.contractType] : ''}
          />
          <ReviewRow label="제목" value={draft.title} />
          <ReviewRow label="업종" value={industryName} />
          <ReviewRow label="홈페이지" value={draft.websiteUrl} />
          <ReviewRow label="주요 상품" value={draft.mainProducts} />
          {product.success && productInfoRows(product.data).map(([label, value]) => <ReviewRow key={label} label={label} value={value ?? ''} numeric={label === '최고 상품 가격대'} />)}
          {/* PG 계약 이력 — 신규 계약에서는 존재할 수 없어(서버에서도 strip) 요약에서 숨긴다. */}
          {draft.contractType !== 'new' && (
            <>
              <ReviewRow label="연간 거래액" value={draft.annualPgVolume ? (formatKrwReadable(Number(draft.annualPgVolume)) || draft.annualPgVolume) : ''} numeric />
              <ReviewRow
                label={
                  draft.currentFeeRate && !draft.currentFeeVisibleToPg
                    ? '카드 수수료 (PG 비공개)'
                    : '카드 수수료'
                }
                value={formatFeeRateDisplay(draft.currentFeeRate)}
                numeric
              />
              <ReviewRow label="월 정산한도" value={formatKrwField(draft.currentSettlementLimit)} numeric />
              <ReviewRow
                label="보증보험"
                value={formatKrwField(draft.currentGuaranteeInsurance)}
                numeric
              />
              <ReviewRow
                label="정산주기"
                value={draft.currentSettlementCycle}
                numeric
              />
            </>
          )}
          <ReviewRow
            label="배송 및 서비스 기간"
            value={draft.deliveryServicePeriod}
          />
          <ReviewRow label="현재 솔루션" value={solutionSummary} />
          <ReviewRow label="견적 결제수단" value={paymentMethodSummary} />
        </div>
      </div>

      {/* 상세 요청사항 (메모) — 발송 시 trim되어 빠지므로 공백뿐이면 미입력 표기 */}
      <div>
        <SectionHeader label="상세 요청사항" />
        {draft.memo.trim() ? (
          <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap break-words border border-[var(--md-sys-color-outline-variant)] p-4">
            {draft.memo}
          </p>
        ) : (
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] p-4">
            미입력
          </p>
        )}
      </div>

      {/* 첨부파일 */}
      <div>
        <SectionHeader label={`첨부파일 (${draft.rfpFiles.length}개)`} />
        {draft.rfpFiles.length > 0 ? (
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {draft.rfpFiles.map((file, i) => (
              <div
                key={file.id}
                className="py-2 flex items-center gap-3 min-w-0"
              >
                <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">
                  {file.name}
                </span>
                <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] shrink-0 ml-auto">
                  {formatSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] border-t border-[var(--md-sys-color-outline-variant)] py-2">
            첨부파일이 없어요
          </p>
        )}
      </div>

    </>
  );

  return (
    <div className={persistentActions ? 'space-y-5' : 'space-y-6'}>
      {/* 마감일 — 라벨은 선택기 그룹의 이름 하나만 둔다(필수 마커는 그 옆). */}
      <div className="space-y-1">
        <BusinessDeadlineField key={serverError} label="견적 마감일" labelAddon={<RequiredMark state={markerState({ valid: isDeadlineValid(draft.deadline), attempted: !!showFieldErrors })} />} value={draft.deadline} choice={draft.deadlineChoice} fixtureCalendar={sampleCalendar} onValidityChange={onDeadlineReady} onChange={(deadline, choice) => { draft.setField('deadline', deadline); draft.setField('deadlineChoice', choice); }} />
        <FieldError error={deadlineError ? (draft.deadline ? '마감일을 다시 확인해 주세요' : '마감일을 선택해주세요') : undefined} />
      </div>

      {/* 오픈 게시판 노출 (opt-out) — 기본 노출(true). kill switch 시 숨김 */}
      {!matching && OPEN_BOARD_ENABLED && (
        <div className="flex items-start gap-3">
          <Checkbox
            id="rfp-board-visible"
            checked={draft.boardVisible}
            onCheckedChange={(checked) => draft.setField('boardVisible', checked)}
            aria-label="오픈 게시판에 노출하기"
            className="mt-0.5"
          />
          <label htmlFor="rfp-board-visible" className="cursor-pointer">
            <span className="block text-[14px] text-[var(--md-sys-color-on-surface)]">
              오픈 게시판에 노출하기
            </span>
            <span className="block text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
              다른 PG사가 이 견적 요청을 발견하고 참여를 요청할 수 있어요.
            </span>
          </label>
        </div>
      )}

      {/* 실제 작성은 질문마다 답을 이미 확인했으므로 핵심만 펼치고 전체 답변은 접어 한 화면에 들어오게 한다. */}
      {persistentActions ? (
        <section aria-label="요청 요약">
          <SectionHeader label="요청 요약" />
          <div className="border border-[var(--md-sys-color-outline-variant)]">
            <ReviewRow label="제목" value={draft.title} />
            <ReviewRow label="업종" value={industryName} />
            <ReviewRow label="견적 결제수단" value={paymentMethodSummary} />
            <ReviewRow label="첨부파일" value={draft.rfpFiles.length ? `${draft.rfpFiles.length}개` : '없음'} numeric />
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer py-1 text-[14px] text-[var(--md-sys-color-primary)]">요청 내용 전체 보기</summary>
            <div className="mt-3 space-y-6">{fullSummary}</div>
          </details>
        </section>
      ) : fullSummary}

      {/* 마지막 확인 단계에서 선택한 PG에만 견적 요청을 보낸다. */}
      {!matching && <div>
        <SectionHeader label="견적을 요청할 PG사" />
        <p className="mb-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          고른 PG사에만 견적 요청을 보내요.
        </p>
        <RfpStep3PgSelect pgList={pgList} recommendedPgIds={selectedIndustry?.pgWorkspaceIds} industryName={selectedIndustry?.name} showFieldErrors={attempted || showFieldErrors} />
      </div>}

      <FieldError error={serverError ? (ERROR_MESSAGES[serverError] ?? serverError) : undefined} />

      {!persistentActions && <ReviewActions {...actions} matching={matching} sampleMode={sampleMode} serverError={serverError} showFieldErrors={showFieldErrors} persistentActions={false} pgList={pgList} industryGroups={industryGroups} bizProfile={bizProfile} workspaceName={workspaceName} pgCount={pgCount} deadlineReady={deadlineReady} onAttempt={onAttempt} />}
    </div>
  );
}
