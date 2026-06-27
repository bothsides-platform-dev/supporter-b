'use client';

// 견적 비교 — 기준 구간 헤더 밴드.
// 조용한 토글을 '지금 보고 있는 수치가 어느 구간 기준인지' 상시 인지시키는 앵커로 승격.
// - 상단: "기준 구간" 라벨 + 5구간 토글 (기존 secondary-container 활성 스타일 유지)
// - 하단: ⓘ 도움말 한 줄 ("카드·간편결제 수수료는 구간마다 달라요")
// - 전환 시 활성 라벨도 tier-flash 스태거에 참여(index 0)
import { cn } from '@/lib/utils';
import { MERCHANT_TIERS, MERCHANT_TIER_LABELS, type MerchantTier } from '@/lib/types/bid';

type Props = {
  tier: MerchantTier;
  onTierChange: (t: MerchantTier) => void;
  /** 구매사 자기 등급 — 미래 "내 등급" 표기 확장용. 현재는 사용 안 함. */
  buyerGrade?: MerchantTier;
};

export function TierContextHeader({ tier, onTierChange, buyerGrade: _buyerGrade }: Props) {
  return (
    <div
      className={cn(
        'rounded-[6px] border border-[var(--md-sys-color-outline-variant)]',
        'bg-[var(--md-sys-color-surface-container-low)]',
        'px-3 py-2 mb-3',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] shrink-0">
          기준 구간
        </span>
        <div role="group" aria-label="기준 구간 선택" className="flex gap-1">
          {MERCHANT_TIERS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tier === t}
              onClick={() => onTierChange(t)}
              className={cn(
                'h-7 px-2.5 rounded-[6px] text-[12px] transition-colors',
                tier === t
                  ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]',
              )}
            >
              {MERCHANT_TIER_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
