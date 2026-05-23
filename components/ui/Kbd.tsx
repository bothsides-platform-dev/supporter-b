import { cn } from '@/lib/utils';

type KbdProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Kbd — a single keyboard keycap for shortcut hints.
 *
 * Linear hard rules: not mono / not `.md-numeric`, sentence-case, subtle keycap
 * (low-contrast surface, 1px border, no shadow). `data-slot="kbd"` lets the
 * Tooltip popup styling target nested keycaps.
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[var(--md-sys-shape-extra-small)]',
        'border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] px-1',
        'text-[length:var(--md-typescale-label-small-size)] font-medium leading-none text-[var(--md-sys-color-on-surface-variant)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
