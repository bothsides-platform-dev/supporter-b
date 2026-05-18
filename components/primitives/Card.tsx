'use client';

import { cn } from '@/lib/utils';

export type CardVariant = 'elevated' | 'filled' | 'outlined';

type CardProps = {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
};

const variantMap: Record<CardVariant, string> = {
  elevated: 'bg-[var(--md-sys-color-surface-container-low)] shadow-[var(--md-sys-elevation-1)] hover:shadow-[var(--md-sys-elevation-2)]',
  filled:   'bg-[var(--md-sys-color-surface-container-highest)]',
  outlined: 'bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]',
};

export function Card({ variant = 'elevated', className, children, onClick }: CardProps) {
  const classes = cn(
    'rounded-[var(--md-sys-shape-medium)] overflow-hidden transition-all',
    variantMap[variant],
    onClick && 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)] active:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_12%,transparent)]',
    className,
  );
  return onClick
    ? <button type="button" onClick={onClick} className={cn(classes, 'block w-full text-left')}>{children}</button>
    : <div className={classes}>{children}</div>;
}
