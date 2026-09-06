// components/rfp/RfpStep2Content.tsx
'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { NumericFormat } from 'react-number-format';
import { Button } from '@/components/primitives/Button';
import { Checkbox } from '@/components/primitives/Checkbox';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass, numericInputClass, CurrencyInput, DayOffsetInput } from '@/components/forms/inputs';
import { InfoTip } from '@/components/ui/info-tip';
import { RfpAttachmentDropzone } from './RfpAttachmentDropzone';
import { RfpPaymentMethodSelect } from './RfpPaymentMethodSelect';
import { RequiredMark } from './RequiredMark';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { isValidWebsiteUrlLight, normalizeWebsiteUrl, WEBSITE_URL_ERROR } from '@/lib/validation/website-url';
import { FieldError } from '@/components/primitives/FieldError';
import {
  isTitleValid,
  isWebsiteValid,
  isPaymentValid,
  isContractTypeValid,
  isMainProductsValid,
  isAnnualPgVolumeSatisfied,
  markerState,
} from '@/lib/rfp/required-fields';
import { cn } from '@/lib/utils';
import { SOLUTION_OPTIONS } from '@/lib/rfp/solutions';
import { CONTRACT_TYPE_LABELS } from '@/lib/types/rfp';

// 카드 수수료는 % 값이라 100을 넘을 수 없다 — 입력 단계에서 상한을 강제한다.
const MAX_FEE_RATE_PCT = 100;

const CONTRACT_TYPE_OPTIONS = [
  { value: 'new', label: CONTRACT_TYPE_LABELS.new },
  { value: 'renewal', label: CONTRACT_TYPE_LABELS.renewal },
] as const;

type Props = {
  onBack: () => void;
  onNext: () => void;
  /** 위저드에서 이미 advance 실패를 경험한 step — 다음 클릭 없이도 에러를 표시 */
  showFieldErrors?: boolean;
  /** 서버가 거부한 홈페이지 URL — 현재 store URL 과 같으면 필드 에러를 표시 */
  websiteRejected?: string;
  /** 튜토리얼 샌드박스 — 첨부를 가상 처리 */
  sampleMode?: boolean;
};

export function RfpStep2Content({ onBack, onNext, showFieldErrors, websiteRejected, sampleMode }: Props) {
  const draft = useRfpDraftStore();
  const [localAttempted, setLocalAttempted] = useState(false);

  const attempted = localAttempted || !!showFieldErrors;
  // 홈페이지: 빈값(필수 미입력)과 형식 오류를 구분
  const websiteEmpty = draft.websiteUrl.trim() === '';
  const websiteFormatInvalid = !websiteEmpty && !isValidWebsiteUrlLight(draft.websiteUrl);
  const websiteServerRejected = !!websiteRejected && websiteRejected === draft.websiteUrl.trim();
  const titleError = attempted && draft.title.trim() === '';
  const contractTypeError = attempted && !isContractTypeValid(draft.contractType);
  const mainProductsError = attempted && !isMainProductsValid(draft.mainProducts);
  const annualPgVolumeError =
    attempted && !isAnnualPgVolumeSatisfied(draft.annualPgVolume, draft.contractType);
  // 신규 계약(첫 PG 계약)은 전년도 PG 거래액·현재 수수료 등 PG 계약 이력 값이 존재할 수
  // 없으므로 해당 입력란을 숨긴다. 배송·서비스 기간과 현재 운영 솔루션은 PG와 무관한
  // 사업 속성이라 유지한다. store 값은 보존(유형 토글 복원)하고 저장 시 서버에서 strip 한다.
  const showPgHistoryFields = draft.contractType !== 'new';
  const paymentError =
    attempted &&
    draft.requiredPaymentMethods.length + draft.customPaymentMethods.length === 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Label size="md" muted={false}>견적 유형</Label>
            <InfoTip term="견적유형" />
          </div>
          <RequiredMark
            state={markerState({ valid: isContractTypeValid(draft.contractType), attempted })}
            filledLabel="선택됨"
          />
        </div>
        <div className="flex gap-2">
          {CONTRACT_TYPE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={draft.contractType === value}
              onClick={() =>
                draft.setField('contractType', draft.contractType === value ? null : value)
              }
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-[var(--md-sys-shape-small)] border transition-colors',
                draft.contractType === value
                  ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                  : 'border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]',
              )}
            >
              <Check
                size={16}
                aria-hidden
                className={draft.contractType === value ? undefined : 'invisible'}
              />
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          기존 계약이 없다면 신규 계약을 선택해요
        </p>
        <FieldError error={contractTypeError ? '견적 유형을 선택해주세요' : undefined} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>제목</Label>
          <RequiredMark state={markerState({ valid: isTitleValid(draft.title), attempted })} />
        </div>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => draft.setField('title', e.target.value)}
          placeholder="2026 서포트쇼핑몰 결제 인프라 견적 요청"
          aria-invalid={titleError}
          className={cn(underlineInputClass, titleError && 'border-[var(--md-sys-color-error)]')}
        />
        <FieldError error={titleError ? '제목을 입력해주세요' : undefined} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>사업 운영 홈페이지</Label>
          <RequiredMark state={markerState({ valid: isWebsiteValid(draft.websiteUrl) && !websiteServerRejected, attempted })} />
        </div>
        <input
          type="text"
          value={draft.websiteUrl}
          onChange={(e) => draft.setField('websiteUrl', e.target.value)}
          onBlur={(e) => {
            const normalized = normalizeWebsiteUrl(e.target.value);
            if (normalized !== e.target.value) draft.setField('websiteUrl', normalized);
          }}
          placeholder="example.com"
          aria-invalid={websiteFormatInvalid || websiteServerRejected || (websiteEmpty && attempted)}
          className={underlineInputClass}
        />
        <FieldError error={websiteEmpty && attempted ? '홈페이지 주소를 입력해주세요' : undefined} />
        <FieldError error={websiteFormatInvalid || websiteServerRejected ? WEBSITE_URL_ERROR : undefined} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>주요 판매 상품</Label>
          <RequiredMark state={markerState({ valid: isMainProductsValid(draft.mainProducts), attempted })} />
        </div>
        <input
          type="text"
          value={draft.mainProducts}
          onChange={(e) => draft.setField('mainProducts', e.target.value)}
          placeholder="의류"
          aria-invalid={mainProductsError}
          className={cn(underlineInputClass, mainProductsError && 'border-[var(--md-sys-color-error)]')}
        />
        <FieldError error={mainProductsError ? '주요 판매 상품을 입력해주세요' : undefined} />
      </div>
      {showPgHistoryFields && (
      <>{/* PG 계약 이력 — 신규 계약에서는 존재할 수 없어 숨김 */}
      <CurrencyInput
        label="전년도 연간 PG 총 거래액"
        value={draft.annualPgVolume}
        onChange={(v) => draft.setField('annualPgVolume', v)}
        placeholder="10억"
        markerState={markerState({ valid: isAnnualPgVolumeSatisfied(draft.annualPgVolume, draft.contractType), attempted })}
        error={annualPgVolumeError ? '전년도 연간 PG 총 거래액을 입력해주세요' : undefined}
      />
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label size="md" muted={false}>현재 카드 수수료</Label>
          <InfoTip term="수수료율" />
        </div>
        <div className="flex items-end gap-1">
          <NumericFormat
            decimalScale={2}
            allowNegative={false}
            isAllowed={({ floatValue }) => floatValue === undefined || floatValue <= MAX_FEE_RATE_PCT}
            value={draft.currentFeeRate}
            onValueChange={(values) => draft.setField('currentFeeRate', values.value)}
            placeholder="3.4"
            className={cn(numericInputClass, 'flex-1')}
          />
          <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">%</span>
        </div>
        {/* 현재 카드 수수료 PG 노출(opt-out) — 기본 공개(true). 끄면 PG 견적 화면에서 숨김. */}
        <div className="flex items-start gap-3 pt-1">
          <Checkbox
            id="rfp-current-fee-visible"
            checked={draft.currentFeeVisibleToPg}
            onCheckedChange={(checked) => draft.setField('currentFeeVisibleToPg', checked)}
            aria-label="현재 카드 수수료를 PG사에 공개하기"
            className="mt-0.5"
          />
          <label htmlFor="rfp-current-fee-visible" className="cursor-pointer">
            <span className="block text-[14px] text-[var(--md-sys-color-on-surface)]">
              현재 카드 수수료를 PG사에 공개하기
            </span>
            <span className="block text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
              {draft.currentFeeVisibleToPg
                ? 'PG사가 현재 수수료를 참고해 제안해요.'
                : 'PG사에게는 현재 수수료를 보여주지 않아요.'}
            </span>
          </label>
        </div>
      </div>
      <CurrencyInput
        label="현재 월 정산한도"
        infoTerm="정산한도"
        value={draft.currentSettlementLimit}
        onChange={(v) => draft.setField('currentSettlementLimit', v)}
        placeholder="100,000,000"
      />
      <CurrencyInput
        label="현재 보증보험"
        infoTerm="보증보험"
        value={draft.currentGuaranteeInsurance}
        onChange={(v) => draft.setField('currentGuaranteeInsurance', v)}
        placeholder="30,000,000"
      />
      <DayOffsetInput
        label="현재 정산주기"
        infoTerm="정산주기"
        value={draft.currentSettlementCycle}
        onChange={(v) => draft.setField('currentSettlementCycle', v)}
        placeholder="1"
      />
      </>
      )}
      <DayOffsetInput
        label="배송 및 서비스 기간"
        infoTerm="NDX"
        value={draft.deliveryServicePeriod}
        onChange={(v) => draft.setField('deliveryServicePeriod', v)}
        placeholder="3"
      />
      <div className="space-y-2">
        <Label size="md" muted={false}>현재 운영 솔루션 유무</Label>
        <div className="flex flex-wrap gap-2">
          {SOLUTION_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={draft.currentSolution === value}
              onClick={() => {
                draft.setField('currentSolution', draft.currentSolution === value ? '' : value);
                if (value !== 'other') {
                  draft.setField('currentSolutionDetail', '');
                }
              }}
              className={cn(
                'rounded-[var(--md-sys-shape-small)] px-3 h-7 text-[13px]',
                draft.currentSolution === value
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                  : 'border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.currentSolution === 'other' && (
          <input
            type="text"
            value={draft.currentSolutionDetail}
            onChange={(e) => draft.setField('currentSolutionDetail', e.target.value)}
            placeholder="솔루션 이름"
            className={underlineInputClass}
          />
        )}
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>견적 요청 세부 내용</Label>
        <textarea
          value={draft.memo}
          onChange={(e) => draft.setField('memo', e.target.value)}
          rows={5}
          placeholder={"OO 쇼핑몰 신규 견적 요청\n결제 창에서의 결제 전환율 최적화\n카드/계좌 결제 수수료 최소화 요청\n정산주기 단축"}
          className={cn(underlineInputClass, 'resize-none')}
        />
      </div>
      <RfpPaymentMethodSelect
        markerState={markerState({
          valid: isPaymentValid(draft.requiredPaymentMethods, draft.customPaymentMethods),
          attempted,
        })}
        error={paymentError}
      />
      <RfpAttachmentDropzone
        value={draft.rfpFiles}
        onChange={(files) => draft.setField('rfpFiles', files)}
        sampleMode={sampleMode}
      />

      <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button type="button" variant="outlined" size="md" onClick={onBack}>
          이전
        </Button>
        <Button data-demo-cursor data-coachmark="tutorial-wizard-next-2" type="button" size="md" onClick={() => { setLocalAttempted(true); onNext(); }}>
          다음
        </Button>
      </div>
    </div>
  );
}
