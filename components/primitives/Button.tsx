import { cn } from '@/lib/utils';

export type ButtonVariant = 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonColor = 'primary' | 'error';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  children: React.ReactNode;
};

const base =
  'inline-flex items-center justify-center gap-1.5 ' +
  'rounded-[var(--md-sys-shape-small)] ' +
  'font-sans font-medium select-none cursor-pointer ' +
  'transition-colors duration-[var(--md-sys-motion-duration-short-4)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 ' +
  'disabled:opacity-38 disabled:cursor-not-allowed disabled:pointer-events-none';

const sizeMap: Record<ButtonSize, string> = {
  sm: [
    'h-7 px-2.5',
    'text-[length:var(--md-typescale-label-medium-size)]',
    'tracking-[var(--md-typescale-label-medium-tracking)]',
  ].join(' '),
  md: [
    'h-8 px-3',
    'text-[length:var(--md-typescale-label-large-size)]',
    'tracking-[var(--md-typescale-label-large-tracking)]',
  ].join(' '),
  lg: [
    'h-9 px-4',
    'text-[length:var(--md-typescale-title-small-size)]',
    'tracking-[var(--md-typescale-title-small-tracking)]',
  ].join(' '),
};

function variantClasses(variant: ButtonVariant, color: ButtonColor): string {
  const primary = color === 'primary';
  const bg = primary ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';
  const onBg = primary ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-error)';
  const ctr = primary ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-error-container)';
  const onCtr = primary ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-error-container)';
  const txt = primary ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';

  switch (variant) {
    case 'filled':
      return [
        `bg-[${bg}] text-[${onBg}]`,
        `hover:bg-[color-mix(in_srgb,${onBg}_10%,${bg})]`,
        `active:bg-[color-mix(in_srgb,${onBg}_16%,${bg})]`,
      ].join(' ');
    case 'outlined':
      return [
        `bg-transparent text-[${txt}]`,
        'border border-[var(--md-sys-color-outline-variant)]',
        `hover:bg-[var(--md-sys-color-surface-container)] hover:border-[var(--md-sys-color-outline)]`,
        `active:bg-[var(--md-sys-color-surface-container-high)]`,
        `focus-visible:border-[${bg}]`,
      ].join(' ');
    case 'text':
      return [
        `bg-transparent text-[${txt}] px-2`,
        `hover:bg-[var(--md-sys-color-surface-container)]`,
        `active:bg-[var(--md-sys-color-surface-container-high)]`,
      ].join(' ');
    case 'elevated':
      return [
        'bg-[var(--md-sys-color-surface-container-low)]',
        'border border-[var(--md-sys-color-outline-variant)]',
        `text-[${txt}]`,
        'shadow-[var(--md-sys-elevation-1)]',
        `hover:bg-[var(--md-sys-color-surface-container)]`,
        `active:bg-[var(--md-sys-color-surface-container-high)]`,
      ].join(' ');
    case 'tonal':
      return [
        `bg-[${ctr}] text-[${onCtr}]`,
        `hover:bg-[color-mix(in_srgb,${onCtr}_8%,${ctr})]`,
        `active:bg-[color-mix(in_srgb,${onCtr}_14%,${ctr})]`,
      ].join(' ');
  }
}

export function Button({
  variant = 'filled',
  size = 'md',
  color = 'primary',
  fullWidth = false,
  icon,
  trailingIcon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        base,
        sizeMap[size],
        variantClasses(variant, color),
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {icon && <span className="[&_svg]:size-4 shrink-0">{icon}</span>}
      {children}
      {trailingIcon && <span className="[&_svg]:size-4 shrink-0">{trailingIcon}</span>}
    </button>
  );
}
