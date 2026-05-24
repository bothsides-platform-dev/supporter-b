'use client';

import { cn } from '@/lib/utils';

type CheckboxProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

export function Checkbox({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <input
        id={id}
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span
        data-testid="checkbox-box"
        data-state={checked ? 'checked' : 'unchecked'}
        aria-hidden
        className={cn(
          'w-4 h-4 rounded-md border flex items-center justify-center transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--md-sys-color-primary)]/30',
          checked
            ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]'
            : cn(
                'border-[var(--md-sys-color-on-surface-variant)] bg-transparent',
                'peer-enabled:peer-hover:border-[var(--md-sys-color-on-surface)]',
              ),
          disabled && 'opacity-50 cursor-not-allowed',
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
