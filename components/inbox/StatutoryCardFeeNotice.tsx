import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import { GRADE_LABELS, type MerchantGrade } from '@/lib/types/biz-profile';

type Props = { grade: MerchantGrade | null };

export function StatutoryCardFeeNotice({ grade }: Props) {
  // 등급 미입력 RFP — 일반 가정으로 9개 카드사별 입력 모드. notice 없음.
  if (grade === null) return null;
  const fee = STATUTORY_CARD_FEE[grade];
  if (isNaN(fee)) return null;

  return (
    <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-3 space-y-1">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        카드 우대수수료 — 법정 고정
      </p>
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        {GRADE_LABELS[grade]} 가맹점의 카드 수수료는{' '}
        <span className="font-mono tabular-nums font-medium text-[var(--md-sys-color-on-surface)]">
          {(fee * 100).toFixed(2)}%
        </span>
        로 여신전문금융업법에 따라 고정됩니다. PG사가 별도로 제시하거나 변경할 수 없습니다.
      </p>
    </div>
  );
}
