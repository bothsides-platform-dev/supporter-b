'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDeadline } from '@/lib/format';
import { useListNavigation } from '@/lib/hooks/useListNavigation';
import type { MerchantGrade } from '@/lib/types/biz-profile';

const invStatusLabel: Record<string, string> = {
  sent: '신규',
  opened: '신규',
  accepted: '견적 보냄',
  declined: '거절',
  expired: '만료',
};

const invStatusColor: Record<string, ChipColor> = {
  sent: 'warning',
  opened: 'warning',
  accepted: 'tertiary',
  declined: 'error',
  expired: 'surface',
};

export type InboxRow = {
  invitationId: string;
  invitationStatus: string;
  /** Domain status of the parent RFP — used by the closed-filter mapping. */
  rfpStatus: string;
  rfpId: string;
  rfpTitle: string;
  rfpDeadline: string;
  grade: string;
  /** Raw merchant-grade enum for the grade filter (label lives in `grade`). */
  gradeRaw?: MerchantGrade;
};

export function InboxList({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const peekCode = searchParams.get('peek');
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  function handlePeek(rfpId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('peek', rfpId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const { active } = useListNavigation(rows.length, {
    onEnter: (i) => handlePeek(rows[i].rfpId),
    onEdit: (i) => handlePeek(rows[i].rfpId),
  });

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-[var(--md-sys-color-surface)]">
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            <th className="px-8 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">번호</th>
            <th className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">제목</th>
            <th className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">등급</th>
            <th className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">마감</th>
            <th className="px-3 py-3 text-right font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const daysLeft = formatDeadline(row.rfpDeadline);
            const isUrgent =
              daysLeft.startsWith('D-') &&
              parseInt(daysLeft.slice(2)) <= 3;
            return (
              <tr
                key={row.invitationId}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onClick={() => handlePeek(row.rfpId)}
                data-active={active === i}
                data-peeked={row.rfpId === peekCode}
                className="group border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] data-[active=true]:bg-[var(--md-sys-color-surface-container-high)] data-[peeked=true]:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition-colors"
              >
                <td className="relative px-8 py-4 font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] group-hover:before:absolute group-hover:before:left-0 group-hover:before:top-0 group-hover:before:bottom-0 group-hover:before:w-2 group-hover:before:bg-[var(--md-sys-color-on-surface)] group-data-[active=true]:before:absolute group-data-[active=true]:before:left-0 group-data-[active=true]:before:top-0 group-data-[active=true]:before:bottom-0 group-data-[active=true]:before:w-2 group-data-[active=true]:before:bg-[var(--md-sys-color-on-surface)] group-data-[peeked=true]:before:absolute group-data-[peeked=true]:before:left-0 group-data-[peeked=true]:before:top-0 group-data-[peeked=true]:before:bottom-0 group-data-[peeked=true]:before:w-0.5 group-data-[peeked=true]:before:bg-[var(--md-sys-color-primary)]">
                  {row.rfpId}
                </td>
                <td className="px-3 py-4 text-[13px] text-[var(--md-sys-color-on-surface)] font-medium">{row.rfpTitle}</td>
                <td className="px-3 py-4 font-mono text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  {row.grade}
                </td>
                <td className={`px-3 py-4 font-mono text-[12px] tabular-nums ${isUrgent ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                  {daysLeft}
                </td>
                <td className="px-3 py-4 text-right">
                  <Chip
                    label={invStatusLabel[row.invitationStatus] ?? row.invitationStatus}
                    color={invStatusColor[row.invitationStatus] ?? 'surface'}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Named export so the Server Component app/(app)/inbox/page.tsx can render the
// skeleton — `InboxList.Skeleton` (static on a 'use client' component) is
// undefined across the RSC boundary. The static below keeps client callers working.
export function InboxListSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-[var(--md-sys-color-surface)]">
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            <th className="px-8 py-3"><Skeleton className="h-2 w-8" /></th>
            <th className="px-3 py-3"><Skeleton className="h-2 w-12" /></th>
            <th className="px-3 py-3"><Skeleton className="h-2 w-8" /></th>
            <th className="px-3 py-3"><Skeleton className="h-2 w-8" /></th>
            <th className="px-3 py-3 text-right"><Skeleton className="h-2 w-8 ml-auto" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-[var(--md-sys-color-outline-variant)]">
              <td className="px-8 py-4"><Skeleton className="h-3 w-20" /></td>
              <td className="px-3 py-4"><Skeleton className="h-3 w-48" /></td>
              <td className="px-3 py-4"><Skeleton className="h-3 w-12" /></td>
              <td className="px-3 py-4"><Skeleton className="h-3 w-16" /></td>
              <td className="px-3 py-4 text-right">
                <Skeleton className="h-5 w-14 rounded-full ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

InboxList.Skeleton = InboxListSkeleton;
