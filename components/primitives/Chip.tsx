'use client';

import { cn } from '@/lib/utils';

export type ChipVariant = 'assist' | 'filter' | 'input' | 'suggestion';
export type ChipColor = 'primary' | 'tertiary' | 'warning' | 'error' | 'surface';

type ChipProps = {
  variant?: ChipVariant;
  color?: ChipColor;
  selected?: boolean;
  onDelete?: () => void;
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

const tonalClasses: Record<ChipColor, string> = {
  primary:  'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-transparent',
  tertiary: 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] border-transparent',
  warning:  'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] border-transparent',
  error:    'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] border-transparent',
  surface:  'bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface-variant)] border-transparent',
};

const outlineClass = 'bg-transparent text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline)]';

export function Chip({
  variant = 'assist',
  color = 'surface',
  selected = false,
  onDelete,
  icon,
  label,
  onClick,
  disabled = false,
  className,
}: ChipProps) {
  const isFilter = variant === 'filter';
  const useTonal = !isFilter || selected;
  const isInteractive = !!onClick;

  const sharedClass = cn(
    'inline-flex items-center gap-1.5 h-6 px-2',
    'rounded-[var(--md-sys-shape-extra-small)]',
    'text-[length:var(--md-typescale-label-medium-size)]',
    'font-[number:var(--md-typescale-label-medium-weight)]',
    'tracking-[var(--md-typescale-label-medium-tracking)]',
    'border select-none',
    useTonal ? tonalClasses[color] : outlineClass,
    isInteractive
      ? 'transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50 disabled:opacity-[0.38] disabled:cursor-not-allowed disabled:pointer-events-none'
      : 'cursor-default',
    className,
  );

  const content = (
    <>
      {icon && <span className="[&_svg]:size-3.5 shrink-0 -ml-0.5">{icon}</span>}
      <span>{label}</span>
      {variant === 'input' && onDelete && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`${label} 제거`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDelete(); } }}
          className="[&_svg]:size-4 shrink-0 -mr-1 hover:opacity-70 cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      )}
    </>
  );

  if (!isInteractive) {
    return <span className={sharedClass}>{content}</span>;
  }

  return (
    <button
      type="button"
      role="button"
      aria-pressed={isFilter ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
      className={sharedClass}
    >
      {content}
    </button>
  );
}

/**
 * Chip 과 같은 색 어휘를 쓰는 비-Chip 표식(레일 도트·타임라인 마크)용 raw CSS 변수.
 * tonalClasses 는 컨테이너 배경색이라 점·선에는 진한 축이 필요하다.
 */
export const TONE_COLOR_VAR: Record<ChipColor, string> = {
  primary: 'var(--md-sys-color-primary)',
  tertiary: 'var(--md-sys-color-tertiary)',
  warning: 'var(--md-sys-color-warning)',
  error: 'var(--md-sys-color-error)',
  surface: 'var(--md-sys-color-outline)',
};
