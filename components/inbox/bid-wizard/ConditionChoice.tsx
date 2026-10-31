'use client';
import type { ConditionState } from '@/lib/quote/terms';

export function ConditionChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ConditionState;
  onChange: (state: ConditionState) => void;
}) {
  return (
    <select
      aria-label={`${label} 조건`}
      value={value}
      onChange={(e) => onChange(e.target.value as ConditionState)}
      className="mb-2 min-h-9 w-full rounded-[6px] border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-background)] px-2 text-[14px] focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]"
    >
      <option value="unset">미입력</option>
      <option value="confirmed">금액 입력</option>
      <option value="negotiable">협의 필요</option>
      <option value="not_applicable">해당 없음</option>
    </select>
  );
}
