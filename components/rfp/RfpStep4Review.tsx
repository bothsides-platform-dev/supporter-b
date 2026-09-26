// components/rfp/RfpStep4Review.tsx
'use client';

import { cleanIndustryName } from '@/lib/rfp/industry-selection';
import { useState } from 'react';
import { productInfoRows, productInfoSchema } from '@/lib/rfp/product-info';
import { RfpMatchingSelection } from './RfpMatchingSelection';
import { MATCHING_ERRORS } from '@/lib/rfp/pg-matching';
import { Button } from '@/components/primitives/Button';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/primitives/Checkbox';
import { Label } from '@/components/primitives/Label';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { formatSize, formatKrwReadable, formatKrwField, formatFeeRateDisplay, formatBizNoDisplay } from '@/lib/utils/format';
import { endOfDayKstIso, kstDateOf } from '@/lib/utils/deadline';
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

type Props = {
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
  INVALID_INPUT: '입력 값을 확인해주세요.',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다. 다시 시도해주세요.',
};

export function RfpStep4Review(props: Props) {
  const review = <ReviewContent {...props} />;
  return props.matching
    ? <RfpMatchingSelection onBack={props.onBack} industryGroups={props.industryGroups ?? []}>{review}</RfpMatchingSelection>
    : review;
}

function ReviewContent({
  matching = false,
  pgList,
  industryGroups = [],
  bizProfile,
  workspaceName,
  onBack,
  onSubmit,
  submitting,
  serverError,
  showFieldErrors,
}: Props) {
  const draft = useRfpDraftStore();
  const product = productInfoSchema.safeParse(draft.productInfo);
  const selectedIndustry = industryGroups.find((group) => group.id === draft.industryGroupId);
  const [minDate] = useState(() =>
    // KST "내일" 날짜: 이른 KST 새벽(UTC 전날 심야)에 당일이 선택 가능한 엣지를 막는다.
    kstDateOf(new Date(Date.now() + 86_400_000)),
  );
  const [attempted, setAttempted] = useState(false);

  const pgCount = draft.allowedPgWorkspaceIds.length;
  const deadlineError = (attempted || !!showFieldErrors) && !draft.deadline;
  const paymentMethodSummary =
    formatRequestedPaymentMethods(draft.requiredPaymentMethods, draft.customPaymentMethods) ?? '';

  const solutionSummary =
    formatSolutionSummary(draft.currentSolution, draft.currentSolutionDetail) ?? '';

  return (
    <div className="space-y-6">
      {/* 마감일 */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>마감일</Label>
          <RequiredMark
            state={markerState({
              valid: isDeadlineValid(draft.deadline),
              attempted: !!showFieldErrors,
            })}
          />
        </div>
        <input
          type="date"
          value={draft.deadline ? draft.deadline.slice(0, 10) : ''}
          min={minDate}
          onChange={(e) =>
            draft.setField(
              'deadline',
              e.target.value ? endOfDayKstIso(e.target.value) : '',
            )
          }
          aria-invalid={deadlineError}
          className={cn(
            'block bg-transparent border-0 border-b py-2 text-[14px] md-numeric text-[var(--md-sys-color-on-surface)] focus:outline-none transition-colors',
            deadlineError
              ? 'border-[var(--md-sys-color-error)] focus:border-[var(--md-sys-color-error)]'
              : 'border-[var(--md-sys-color-outline)] focus:border-[var(--md-sys-color-on-surface)]',
          )}
        />
        <FieldError error={deadlineError ? '마감일을 선택해주세요' : undefined} />
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
          <ReviewRow label="업종" value={draft.industryMode === 'custom' ? cleanIndustryName(draft.customIndustryName) : selectedIndustry?.name ?? ''} />
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

      {/* 마지막 확인 단계에서 선택한 PG에만 견적 요청을 보낸다. */}
      {!matching && <div>
        <SectionHeader label="견적을 요청할 PG사" />
        <p className="mb-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          고른 PG사에만 견적 요청을 보내요.
        </p>
        <RfpStep3PgSelect pgList={pgList} recommendedPgIds={selectedIndustry?.pgWorkspaceIds} industryName={selectedIndustry?.name} showFieldErrors={attempted || showFieldErrors} />
      </div>}

      <FieldError error={serverError ? (ERROR_MESSAGES[serverError] ?? serverError) : undefined} />

      <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button
          type="button"
          variant="outlined"
          size="md"
          onClick={onBack}
          disabled={submitting}
        >
          이전
        </Button>
        <Button
          data-demo-cursor
          data-coachmark="tutorial-wizard-submit"
          type="button"
          size="lg"
          disabled={submitting || (matching && pgCount === 0)}
          onClick={() => { setAttempted(true); void onSubmit(); }}
        >
          {submitting
            ? '보내는 중…'
            : matching ? '상담 요청하기' : pgCount > 0
              ? `${pgCount}개 PG사에 보내기`
              : '보내기'}
        </Button>
      </div>
    </div>
  );
}
