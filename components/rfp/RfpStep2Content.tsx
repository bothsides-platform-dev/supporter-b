// components/rfp/RfpStep2Content.tsx
'use client';

import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass } from '@/components/forms/inputs';
import { RfpAttachmentDropzone } from './RfpAttachmentDropzone';
import { RfpPaymentMethodSelect } from './RfpPaymentMethodSelect';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { cn } from '@/lib/utils';

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
  const canNext = draft.title.trim() !== '';

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Label size="md" muted={false}>제목 *</Label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => draft.setField('title', e.target.value)}
          placeholder="2026 서포트쇼핑몰 결제 인프라 제안건"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>사업 운영 홈페이지</Label>
        <input
          type="text"
          value={draft.websiteUrl}
          onChange={(e) => draft.setField('websiteUrl', e.target.value)}
          placeholder="https://bidit.store/"
          className={underlineInputClass}
        />
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
        <Label size="md" muted={false}>현재 카드 수수료</Label>
        <input
          type="text"
          value={draft.currentFeeRate}
          onChange={(e) => draft.setField('currentFeeRate', e.target.value)}
          placeholder="3.4%"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>현재 월 정산한도</Label>
        <input
          type="text"
          value={draft.currentSettlementLimit}
          onChange={(e) => draft.setField('currentSettlementLimit', e.target.value)}
          placeholder="월 1억"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <Label size="md" muted={false}>현재 보증보험</Label>
        <input
          type="text"
          value={draft.currentGuaranteeInsurance}
          onChange={(e) => draft.setField('currentGuaranteeInsurance', e.target.value)}
          placeholder="3000만원"
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
        <Label size="md" muted={false}>제안서 요청 세부 내용</Label>
        <textarea
          value={draft.memo}
          onChange={(e) => draft.setField('memo', e.target.value)}
          rows={4}
          placeholder="카드결제·간편결제 통합 솔루션 검토 중입니다. 정산주기 D+1 이내 희망."
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
        <Button type="button" size="md" disabled={!canNext} onClick={onNext}>
          다음
        </Button>
      </div>
    </div>
  );
}
