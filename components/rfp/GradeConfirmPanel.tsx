'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { MERCHANT_TIERS, MERCHANT_TIER_LABELS, type MerchantTier } from '@/lib/types/bid';

type Source = 'user_confirmed' | 'user_overridden';

type Props = {
  /** Self-declared grade selection. Source is always `user_confirmed` in v0
   *  (Step 6) — `user_overridden` is reserved for the post-NICE flow that
   *  Step 7+ may reintroduce. */
  onConfirm: (grade: MerchantTier, source: Source) => void;
};

const ALL_GRADES: readonly MerchantTier[] = MERCHANT_TIERS;

// Statutory revenue brackets (annual, 카드 가맹점 우대수수료 기준).
// Used as plain helper text — not a hard validator.
const REVENUE_HINT: Record<MerchantTier, string> = {
  sole: '연매출 3억 원 이하',
  sme1: '연매출 3억 ~ 5억 원',
  sme2: '연매출 5억 ~ 10억 원',
  sme3: '연매출 10억 ~ 30억 원',
  general: '연매출 30억 원 초과',
};

export function GradeConfirmPanel({ onConfirm }: Props) {
  const [grade, setGrade] = useState<MerchantTier>('sme1');
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
          등급 확정
        </span>
        <Chip label={MERCHANT_TIER_LABELS[grade]} color="surface" />
        <button
          type="button"
          onClick={() => setConfirmed(false)}
          className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors ml-auto"
        >
          수정
        </button>
      </div>
    );
  }

  return (
    <fieldset className="space-y-3" data-testid="grade-confirm-panel">
      <legend className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mb-1">
        가맹점 등급 (자기신고)
      </legend>
      <div className="border border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
        {ALL_GRADES.map((g) => {
          const selected = grade === g;
          return (
            <label
              key={g}
              htmlFor={`grade-${g}`}
              className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
            >
              <input
                id={`grade-${g}`}
                type="radio"
                name="merchant-grade"
                value={g}
                checked={selected}
                onChange={() => setGrade(g)}
                className="w-3.5 h-3.5 accent-[var(--md-sys-color-on-surface)]"
              />
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)] font-medium min-w-[3rem]">
                {MERCHANT_TIER_LABELS[g]}
              </span>
              <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] flex-1">
                {REVENUE_HINT[g]}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
          등급은 PG에게 전달되는 참고 정보예요 — 카드 수수료는 모두 협상 대상.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setConfirmed(true);
            onConfirm(grade, 'user_confirmed');
          }}
        >
          확인
        </Button>
      </div>
    </fieldset>
  );
}
