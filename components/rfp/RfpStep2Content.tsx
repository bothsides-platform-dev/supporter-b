// components/rfp/RfpStep2Content.tsx
'use client';

import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass } from '@/components/forms/inputs';
import { InfoTip } from '@/components/ui/info-tip';
import { RfpAttachmentDropzone } from './RfpAttachmentDropzone';
import { RfpPaymentMethodSelect } from './RfpPaymentMethodSelect';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { isValidWebsiteUrl, WEBSITE_URL_ERROR } from '@/lib/validation/website-url';
import { cn } from '@/lib/utils';

const CONTRACT_TYPE_OPTIONS = [
  { value: 'new', label: '신규 계약' },
  { value: 'renewal', label: '갱신 계약' },
] as const;

const SOLUTION_OPTIONS = [
  { value: 'cafe24', label: '카페24' },
  { value: 'imweb', label: '아임웹' },
  { value: 'makeshop', label: '메이크샵' },
  { value: 'godo', label: '고도몰' },
  { value: 'self', label: '자체 개발' },
  { value: 'other', label: '기타' },
] as const;

type Props = {
  onBack: () => void;
  onNext: () => void;
};

export function RfpStep2Content({ onBack, onNext }: Props) {
  const draft = useRfpDraftStore();

  const websiteInvalid = !isValidWebsiteUrl(draft.websiteUrl);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Label size="md" muted>견적 유형 <span className="text-[var(--md-sys-color-on-surface-variant)]">(선택)</span></Label>
        <div className="flex gap-2">
          {CONTRACT_TYPE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                draft.setField('contractType', draft.contractType === value ? null : value)
              }
              className={cn(
                'px-3 py-1.5 text-[13px] rounded-[var(--md-sys-shape-small)] border transition-colors',
                draft.contractType === value
                  ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                  : 'border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>제목 *</Label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => draft.setField('title', e.target.value)}
          placeholder="2026 서포트쇼핑몰 결제 인프라 견적 요청"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>사업 운영 홈페이지</Label>
        <input
          type="text"
          value={draft.websiteUrl}
          onChange={(e) => draft.setField('websiteUrl', e.target.value)}
          placeholder="https://supporter-b.com/"
          aria-invalid={websiteInvalid}
          className={underlineInputClass}
        />
        {websiteInvalid && (
          <p role="alert" className="text-[12px] text-[var(--md-sys-color-error)]">
            {WEBSITE_URL_ERROR}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>주요 판매 상품</Label>
        <input
          type="text"
          value={draft.mainProducts}
          onChange={(e) => draft.setField('mainProducts', e.target.value)}
          placeholder="의류"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>전년도 연간 PG 총 거래액</Label>
        <input
          type="text"
          value={draft.annualPgVolume}
          onChange={(e) => draft.setField('annualPgVolume', e.target.value)}
          placeholder="10억"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label size="md" muted={false}>현재 카드 수수료</Label>
          <InfoTip term="수수료율" />
        </div>
        <input
          type="text"
          value={draft.currentFeeRate}
          onChange={(e) => draft.setField('currentFeeRate', e.target.value)}
          placeholder="3.4%"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label size="md" muted={false}>현재 월 정산한도</Label>
          <InfoTip term="정산한도" />
        </div>
        <input
          type="text"
          value={draft.currentSettlementLimit}
          onChange={(e) => draft.setField('currentSettlementLimit', e.target.value)}
          placeholder="월 1억"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label size="md" muted={false}>현재 보증보험</Label>
          <InfoTip term="보증보험" />
        </div>
        <input
          type="text"
          value={draft.currentGuaranteeInsurance}
          onChange={(e) => draft.setField('currentGuaranteeInsurance', e.target.value)}
          placeholder="3000만원"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label size="md" muted={false}>현재 정산주기</Label>
          <InfoTip term="정산주기" />
        </div>
        <input
          type="text"
          value={draft.currentSettlementCycle}
          onChange={(e) => draft.setField('currentSettlementCycle', e.target.value)}
          placeholder="D+1"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label size="md" muted={false}>배송 및 서비스 기간</Label>
          <InfoTip term="NDX" />
        </div>
        <input
          type="text"
          value={draft.deliveryServicePeriod}
          onChange={(e) => draft.setField('deliveryServicePeriod', e.target.value)}
          placeholder="D+3"
          className={underlineInputClass}
        />
      </div>
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
                if (value !== 'self' && value !== 'other') {
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
        {(draft.currentSolution === 'self' || draft.currentSolution === 'other') && (
          <input
            type="text"
            value={draft.currentSolutionDetail}
            onChange={(e) => draft.setField('currentSolutionDetail', e.target.value)}
            placeholder={draft.currentSolution === 'self' ? '독립몰 이름' : '솔루션 이름'}
            className={underlineInputClass}
          />
        )}
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>견적 요청 세부 내용</Label>
        <textarea
          value={draft.memo}
          onChange={(e) => draft.setField('memo', e.target.value)}
          rows={4}
          placeholder={"결제 수수료 최소화 요청\n결제 전환율 최적화 레퍼런스 요청\n정산주기 D+4 이내 요청"}
          className={cn(underlineInputClass, 'resize-none')}
        />
      </div>
      <RfpPaymentMethodSelect />
      <RfpAttachmentDropzone
        value={draft.rfpFiles}
        onChange={(files) => draft.setField('rfpFiles', files)}
      />

      <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button type="button" variant="outlined" size="md" onClick={onBack}>
          이전
        </Button>
        <Button type="button" size="md" onClick={onNext}>
          다음
        </Button>
      </div>
    </div>
  );
}
