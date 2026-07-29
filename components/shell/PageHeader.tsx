import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  count?: number;
  /** 페이지가 무엇을 하는 곳인지 한 줄 설명. 넘기면 스트립이 2행으로 늘어난다. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

/**
 * PageHeader — lightweight list-page header.
 * Renders: title (h1) + optional count pill + optional right-side action slot,
 * and an optional one-line description below them.
 * Follows Linear density: 48px strip (description 없을 때), 14px body, outline-variant border.
 */
export function PageHeader({ title, count, description, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'border-b border-[var(--md-sys-color-outline-variant)] px-6',
        className,
      )}
    >
      <div
        data-testid="page-header-row"
        className={cn('flex items-center gap-3', description ? 'pt-3' : 'h-12')}
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

      {description && (
        <p
          data-testid="page-header-description"
          className="pb-3 pt-1 text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-on-surface-variant)]"
        >
          {description}
        </p>
      )}
    </div>
  );
}
