import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
};

/**
 * PageHeader — lightweight list-page header.
 * Renders: title (h1) + optional count pill + optional right-side action slot.
 * Follows Linear density: 32px height, 14px body, outline-variant border.
 */
export function PageHeader({ title, count, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-12 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6',
        className,
      )}
    >
      <h1 className="text-[length:var(--md-typescale-title-medium-size)] font-[number:var(--md-typescale-title-medium-weight)] tracking-[var(--md-typescale-title-medium-tracking)] text-[var(--md-sys-color-on-surface)]">
        {title}
      </h1>

      {count !== undefined && (
        <span
          data-testid="page-header-count"
          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-[var(--md-sys-shape-extra-small)] bg-[var(--md-sys-color-surface-container)] px-1.5 text-[length:var(--md-typescale-label-small-size)] font-medium text-[var(--md-sys-color-on-surface-variant)] md-numeric"
        >
          {count}
        </span>
      )}

      {action && (
        <div data-testid="page-header-action" className="ml-auto">
          {action}
        </div>
      )}
    </div>
  );
}
