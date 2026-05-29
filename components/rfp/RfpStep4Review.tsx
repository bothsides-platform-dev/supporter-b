// components/rfp/RfpStep4Review.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { PAYMENT_METHOD_LABELS } from '@/lib/types/bid';
import type { BizProfile } from '@/lib/types/biz-profile';

type Props = {
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  workspaceName?: string;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  serverError: string;
};

function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="px-4 py-2.5 flex items-baseline justify-between border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <span className="text-[13px] text-[var(--md-sys-color-on-surface)] font-mono tabular-nums">
        {value}
      </span>
    </div>
  );
}

const SOLUTION_LABELS: Record<string, string> = {
  cafe24: '카페24',
  imweb: '아임웹',
  makeshop: '메이크샵',
  godo: '고도몰',
  self: '자체 개발',
  other: '기타',
};

export function RfpStep4Review({
  bizProfile,
  workspaceName,
  onBack,
  onSubmit,
  submitting,
  serverError,
}: Props) {
  const draft = useRfpDraftStore();
  const [minDate] = useState(() =>
    new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  );

  const pgCount = draft.allowedPgWorkspaceIds.length;
  const paymentMethodSummary = [
    ...draft.requiredPaymentMethods.map((m) => PAYMENT_METHOD_LABELS[m]),
    ...draft.customPaymentMethods.map((c) => c.label),
  ].join(', ');

  return (
    <div className="space-y-6">
      {/* 마감일 */}
      <div className="space-y-1">
        <Label size="md" muted={false}>
          마감일 *
        </Label>
        <input
          type="date"
          value={draft.deadline ? draft.deadline.slice(0, 10) : ''}
          min={minDate}
          onChange={(e) =>
            draft.setField(
              'deadline',
              e.target.value ? `${e.target.value}T23:59:59Z` : '',
            )
          }
          className="block bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] font-mono tabular-nums text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
        />
      </div>

      {/* 제안 내용 요약 */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            제안 내용 요약
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="border border-[var(--md-sys-color-outline-variant)]">
          {workspaceName && <ReviewRow label="상호명" value={workspaceName} />}
          {bizProfile?.bizNo && (
            <ReviewRow label="사업자번호" value={bizProfile.bizNo} />
          )}
          <ReviewRow label="제목" value={draft.title} />
          <ReviewRow label="홈페이지" value={draft.websiteUrl} />
          <ReviewRow label="주요 상품" value={draft.mainProducts} />
          <ReviewRow label="연간 거래액" value={draft.annualPgVolume} />
          <ReviewRow label="카드 수수료" value={draft.currentFeeRate} />
          <ReviewRow label="월 정산한도" value={draft.currentSettlementLimit} />
          <ReviewRow
            label="보증보험"
            value={draft.currentGuaranteeInsurance}
          />
          {draft.currentSolution && (
            <ReviewRow
              label="현재 솔루션"
              value={
                (SOLUTION_LABELS[draft.currentSolution] ??
                  draft.currentSolution) +
                (draft.currentSolutionDetail
                  ? ` — ${draft.currentSolutionDetail}`
                  : '')
              }
            />
          )}
          <ReviewRow label="견적 결제수단" value={paymentMethodSummary} />
        </div>
      </div>

      {/* 초대 PG 목록 */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            초대할 PG사 ({pgCount}개)
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {draft.allowedPgWorkspaceIds.map((ws, i) => (
            <div key={ws.id} className="py-2 flex items-center gap-3">
              <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">
                {ws.displayName}
              </span>
            </div>
          ))}
        </div>
      </div>

      {serverError && (
        <p
          role="alert"
          className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
        >
          {serverError}
        </p>
      )}

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
          type="button"
          size="lg"
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting
            ? '발송 중…'
            : pgCount > 0
              ? `${pgCount}개 PG사에 발송`
              : '발송'}
        </Button>
      </div>
    </div>
  );
}
