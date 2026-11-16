'use client';

// 조회 중인 수수료 구간과 구매사 자신의 등급을 구분한다.
import { cn } from '@/lib/utils';
import { MERCHANT_TIERS, MERCHANT_TIER_LABELS, type MerchantTier } from '@/lib/types/bid';

type Props = {
  tier: MerchantTier;
  onTierChange: (t: MerchantTier) => void;
  /** 구매사 자기 등급 — 다른 구간을 볼 때 현재 등급과 혼동하지 않게 표시한다. */
  buyerGrade?: MerchantTier;
};

export function TierContextHeader({ tier, onTierChange, buyerGrade }: Props) {
  return (
    <div
      className={cn(
        'rounded-[6px] border border-[var(--md-sys-color-outline-variant)]',
        'bg-[var(--md-sys-color-surface-container-low)]',
        'px-3 py-3',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
          기준 구간
        </span>
        {buyerGrade && (
          <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            내 등급: {MERCHANT_TIER_LABELS[buyerGrade]}
          </span>
        )}
      </div>
      <div role="group" aria-label="기준 구간 선택" className="mt-2 grid grid-cols-5 gap-1">
        {MERCHANT_TIERS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tier === t}
            onClick={() => onTierChange(t)}
            className={cn(
              'min-h-9 min-w-0 rounded-[6px] px-1 py-2 text-[13px] transition-colors touch-manipulation pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]',
              tier === t
                ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]',
            )}
          >
            {MERCHANT_TIER_LABELS[t]}
          </button>
        ))}
      </div>
      {buyerGrade && tier !== buyerGrade && (
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          내 등급과 다른 구간의 요율을 보고 있어요.
        </p>
      )}
    </div>
  );
}
