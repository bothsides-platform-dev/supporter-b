'use client';

import { Label } from '@/components/primitives/Label';
import { InfoTip } from '@/components/ui/info-tip';
import { cn } from '@/lib/utils';

/**
 * Shared form-input primitives. The underline field style was copy-pasted as
 * `inputBase` / `INPUT_CLASS` across BidForm, RfpStep2Content and others; this
 * is the single source. Numeric fields (Percent/Currency) add mono + tabular
 * nums on top per the Linear `.md-numeric` rule.
 */
export const underlineInputClass =
  'block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors';

export const numericInputClass = cn(underlineInputClass, 'font-mono tabular-nums');

type NumericFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 라벨 옆에 ⓘ 설명 아이콘을 붙일 용어집 키 (예: '정산한도') */
  infoTerm?: string;
};

/** Labeled numeric input with a `%` suffix and a "per ₩10,000" hint. */
export function PercentInput({
  label,
  value,
  onChange,
  placeholder = '0.00',
  infoTerm,
}: NumericFieldProps) {
  const numVal = parseFloat(value);
  const hint =
    !isNaN(numVal) && numVal > 0
      ? `= 1만원 결제 시 ${Math.round(numVal * 100).toLocaleString()}원`
      : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label size="md" muted={false}>{label}</Label>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div className="flex items-end gap-1">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(numericInputClass, 'flex-1')}
        />
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">%</span>
      </div>
      {hint && (
        <p className="font-mono text-[11px] text-[var(--md-sys-color-tertiary)] mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Labeled numeric input with a `원` suffix, stepping by 1,000. */
export function CurrencyInput({
  label,
  value,
  onChange,
  placeholder = '0',
  infoTerm,
}: NumericFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label size="md" muted={false}>{label}</Label>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div className="flex items-end gap-1">
        <input
          type="number"
          min="0"
          step="1000"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(numericInputClass, 'flex-1')}
        />
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">원</span>
      </div>
    </div>
  );
}
