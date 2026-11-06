'use client';

import { cn } from '@/lib/utils';

type CheckboxProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  /** 제출이 막힌 필수 항목. 미체크 보더를 오류색으로 바꾸고 `aria-invalid` 를 켠다. */
  invalid?: boolean;
  'aria-describedby'?: string;
};

export function Checkbox({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  invalid = false,
  'aria-describedby': ariaDescribedBy,
}: CheckboxProps) {
  return (
    <span
      data-testid="checkbox-root"
      className={cn('relative inline-flex h-4 w-4 shrink-0', className)}
    >
      <input
        id={id}
        type="checkbox"
        className={cn(
          'peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0',
          disabled && 'cursor-not-allowed',
        )}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={ariaDescribedBy}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span
        data-testid="checkbox-box"
        data-state={checked ? 'checked' : 'unchecked'}
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--md-sys-color-primary)]/30',
          checked
            ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]'
            : invalid
              ? 'border-[var(--md-sys-color-error)] bg-transparent'
              : cn(
                  'border-[var(--md-sys-color-on-surface-variant)] bg-transparent',
                  'peer-enabled:peer-hover:border-[var(--md-sys-color-on-surface)]',
                ),
          disabled && 'opacity-50',
        )}
      >
        {checked && (
          <svg
            data-testid="checkbox-check"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden
          >
            <path
              d="M2 5l2.5 2.5 3.5-4"
              stroke="var(--md-sys-color-on-primary)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </span>
  );
}
