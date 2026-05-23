import { cn } from '@/lib/utils';

export type AvatarColor = 'primary' | 'secondary' | 'tertiary' | 'error' | 'surface';
type AvatarSize = 'sm' | 'md' | 'lg';

const colorMap: Record<AvatarColor, string> = {
  primary:   'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]',
  secondary: 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]',
  tertiary:  'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]',
  error:     'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]',
  surface:   'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]',
};

const sizeMap: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-[length:var(--md-typescale-label-small-size)]',
  md: 'w-8 h-8 text-[length:var(--md-typescale-label-large-size)]',
  lg: 'w-10 h-10 text-[length:var(--md-typescale-title-small-size)]',
};

type AvatarProps = { name: string; color?: AvatarColor; size?: AvatarSize; className?: string };

export function Avatar({ name, color = 'primary', size = 'md', className }: AvatarProps) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--md-sys-shape-full)]',
        'font-[number:var(--md-typescale-label-large-weight)] select-none',
        colorMap[color],
        sizeMap[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}
