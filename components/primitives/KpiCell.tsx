import { cn } from '@/lib/utils';

type KpiDelta = { direction: 'up' | 'down' | 'neutral'; text: string };

type KpiCellProps = {
  label: string;
  value: string;
  delta?: KpiDelta;
  className?: string;
};

const deltaIcon = { up: '↑', down: '↓', neutral: '—' } as const;

const deltaColor = {
  up:      'text-[var(--md-sys-color-tertiary)]',
  down:    'text-[var(--md-sys-color-error)]',
  neutral: 'text-[var(--md-sys-color-on-surface-variant)]',
} as const;

export function KpiCell({ label, value, delta, className }: KpiCellProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <span className="md-numeric text-[length:var(--md-typescale-display-small-size)] font-[number:var(--md-typescale-display-small-weight)] text-[var(--md-sys-color-on-surface)] leading-[var(--md-typescale-display-small-line-height)]">
        {value}
      </span>
      {delta && (
        <span className={cn(
          'md-numeric text-[length:var(--md-typescale-label-small-size)]',
          deltaColor[delta.direction],
        )}>
          {deltaIcon[delta.direction]} {delta.text}
        </span>
      )}
    </div>
  );
}
