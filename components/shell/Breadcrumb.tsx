'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

type BreadcrumbProps = {
  segments: string[];
  className?: string;
};

/**
 * Breadcrumb — history navigation + current-path label.
 * `‹ ›` buttons call router.back() / router.forward().
 * Segments joined by "/" separator.
 */
export function Breadcrumb({ segments, className }: BreadcrumbProps) {
  const router = useRouter();

  return (
    <nav
      aria-label="브레드크럼"
      className={cn(
        'flex h-8 items-center gap-1 text-[length:var(--md-typescale-label-medium-size)] text-[var(--md-sys-color-on-surface-variant)]',
        className,
      )}
    >
      <button
        type="button"
        aria-label="뒤로"
        onClick={() => router.back()}
        className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--md-sys-shape-extra-small)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]"
      >
        <ChevronLeftIcon size={14} />
      </button>

      <button
        type="button"
        aria-label="앞으로"
        onClick={() => router.forward()}
        className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--md-sys-shape-extra-small)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]"
      >
        <ChevronRightIcon size={14} />
      </button>

      <ol className="ml-1 flex items-center gap-1">
        {segments.map((segment, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-[var(--md-sys-color-outline)]">
                /
              </span>
            )}
            <span
              className={
                i === segments.length - 1
                  ? 'text-[var(--md-sys-color-on-surface)]'
                  : 'text-[var(--md-sys-color-on-surface-variant)]'
              }
            >
              {segment}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
