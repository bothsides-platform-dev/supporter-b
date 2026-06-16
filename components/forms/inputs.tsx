'use client';

import { useId, useState } from 'react';
import { NumericFormat } from 'react-number-format';
import { Label } from '@/components/primitives/Label';
import { InfoTip } from '@/components/ui/info-tip';
import { formatKrwReadable, formatRatePerManwon } from '@/lib/format';
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
  const rate = formatRatePerManwon(parseFloat(value));
  const hint = rate ? `= ${rate}` : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label size="md" muted={false}>{label}</Label>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div className="flex items-end gap-1">
        <NumericFormat
          decimalScale={2}
          allowNegative={false}
          value={value}
          onValueChange={(values) => onChange(values.value)}
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

type FeeRateCellProps = {
  value: string;
  onChange: (v: string) => void;
  /** 그리드 셀 식별용 data-testid (예: `fee-cell-card-sole`) */
  testId?: string;
  ariaLabel?: string;
  /**
   * 툴팁 수평 정렬 — 첫 열(영세)은 'start', 마지막 열(일반)은 'end', 그 외 'center'(기본).
   * 양끝 열에서 툴팁이 화면 밖으로 오버플로되는 것을 막기 위해 사용한다.
   */
  tooltipAlign?: 'start' | 'center' | 'end';
};

/**
 * 구간별 우대수수료 그리드 셀. 숫자(소수 2자리)만 입력되며, 칸이 좁아
 * 라벨·접미를 두지 않는 대신 포커스/호버 시 "1만원 결제 시 N원" 환산 툴팁을 띄운다.
 */
export function FeeRateCell({
  value,
  onChange,
  testId,
  ariaLabel,
  tooltipAlign = 'center',
}: FeeRateCellProps) {
  const tooltipId = useId();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hint = formatRatePerManwon(parseFloat(value)) || null;
  const showHint = (focused || hovered) && !!hint;

  const tooltipPositionClass =
    tooltipAlign === 'start'
      ? 'left-0'
      : tooltipAlign === 'end'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';

  return (
    // 포커스/호버 감지는 래퍼에 둔다 — React onFocus/onBlur 는 focusin/focusout
    // 버블링을 쓰므로 NumericFormat 내부 onFocus 가로채기와 무관하게 동작한다.
    <div
      className="relative"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NumericFormat
        data-testid={testId}
        aria-label={ariaLabel}
        aria-describedby={showHint ? tooltipId : undefined}
        decimalScale={2}
        allowNegative={false}
        value={value}
        onValueChange={(values) => onChange(values.value)}
        placeholder="0.00"
        className={numericInputClass}
      />
      {showHint && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute top-full z-50 mt-1 whitespace-nowrap rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface)] shadow-md ${tooltipPositionClass}`}
        >
          {hint}
        </div>
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
  const numVal = parseFloat(value);
  const hint =
    !isNaN(numVal) && numVal > 0 ? `= ${formatKrwReadable(numVal)}` : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label size="md" muted={false}>{label}</Label>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div className="flex items-end gap-1">
        <NumericFormat
          thousandSeparator=","
          decimalScale={0}
          allowNegative={false}
          value={value}
          onValueChange={(values) => onChange(values.value)}
          placeholder={placeholder}
          className={cn(numericInputClass, 'flex-1')}
        />
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">원</span>
      </div>
      {hint && (
        <p className="font-mono text-[11px] text-[var(--md-sys-color-tertiary)] mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Labeled integer input with a fixed `D+` prefix. Always emits a `D+N` string
 * (e.g. `"D+1"`); `W+`/`M+` can no longer be entered (only `D+`). Downstream
 * cycle comparison (`CYCLE_RE = /^[DWM]\+\d+$/` in lib/utils/bid-compare.ts)
 * still accepts `W+`/`M+` for legacy rows. An empty input stores `""`.
 */
export function DayOffsetInput({
  label,
  value,
  onChange,
  placeholder = '0',
  infoTerm,
}: NumericFieldProps) {
  const numeric = value.match(/\d+/)?.[0] ?? '';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label size="md" muted={false}>{label}</Label>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div className="flex items-end gap-1">
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">D+</span>
        <NumericFormat
          decimalScale={0}
          allowNegative={false}
          value={numeric}
          onValueChange={(values) => onChange(values.value ? `D+${values.value}` : '')}
          placeholder={placeholder}
          className={cn(numericInputClass, 'flex-1')}
        />
      </div>
    </div>
  );
}
