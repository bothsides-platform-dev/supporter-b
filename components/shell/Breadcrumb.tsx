'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { getBreadcrumbSegments } from '@/lib/nav/nav-config';
import { cn } from '@/lib/utils';

type BreadcrumbProps = {
  className?: string;
};

/**
 * Breadcrumb — history navigation + clickable current-path trail, derived from
 * the URL. `‹ ›` buttons call router.back() / router.forward(); the trail comes
 * from `getBreadcrumbSegments(pathname, status)` so pages don't pass segments.
 * Ancestor segments link to their page; the last segment is the current page.
 *
 * Reads `useSearchParams()`, so render this inside a <Suspense> boundary.
 */
export function Breadcrumb({ className }: BreadcrumbProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const segments = getBreadcrumbSegments(pathname, searchParams.get('status'));

  return (
    <div
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

      {segments.length > 0 && (
        <BreadcrumbRoot aria-label="브레드크럼" className="ml-1">
          <BreadcrumbList>
            {segments.map((segment, i) => {
              const isLast = i === segments.length - 1;
              return (
                <Fragment key={i}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {segment.href && !isLast ? (
                      <BreadcrumbLink render={<Link href={segment.href} />}>
                        {segment.label}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </BreadcrumbRoot>
      )}
    </div>
  );
}
