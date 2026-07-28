'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type SelectOption = { value: string; label: string };

type SelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  id?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ options, value, onChange, className, ariaLabel, id }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'block w-full appearance-none bg-[var(--md-sys-color-surface-container-low)]',
            'border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)]',
            'h-8 px-2.5 pr-8',
            'text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-on-surface)]',
            'hover:border-[var(--md-sys-color-outline)]',
            'focus:outline-none focus:border-[var(--md-sys-color-primary)] focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/40 transition-colors',
            'cursor-pointer',
            className,
          )}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)] text-sm"
        >
          ▾
        </span>
      </div>
    );
  },
);
