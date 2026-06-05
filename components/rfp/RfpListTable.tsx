'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { useListNavigation } from '@/lib/hooks/useListNavigation';
import { formatDate } from '@/lib/format';
import type { RFP } from '@/lib/types/rfp';

const statusLabel: Record<string, string> = {
  draft: '임시저장',
  sent: '요청 보냄',
  closed: '마감',
  awarded: '선정 완료',
  cancelled: '취소',
};

const statusColor: Record<string, ChipColor> = {
  draft: 'surface',
  sent: 'warning',
  closed: 'surface',
  awarded: 'tertiary',
  cancelled: 'error',
};

type Props = { rfps: RFP[] };

export function RfpListTable({ rfps }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const peekCode = searchParams.get('peek');
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  function handlePeek(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('peek', code);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const { active } = useListNavigation(rfps.length, {
    onEnter: (i) => handlePeek(rfps[i].code),
    onEdit: (i) => handlePeek(rfps[i].code),
  });

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-[var(--md-sys-color-surface)]">
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            <th className="px-8 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">
              번호
            </th>
            <th className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">
              제목
            </th>
            <th className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">
              마감
            </th>
            <th className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">
              PG수
            </th>
            <th className="px-3 py-3 text-right font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">
              상태
            </th>
          </tr>
        </thead>
        <tbody>
          {rfps.map((rfp, i) => (
            <tr
              key={rfp.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onClick={() => handlePeek(rfp.code)}
              data-active={active === i}
              data-peeked={rfp.code === peekCode}
              className="group border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] data-[active=true]:bg-[var(--md-sys-color-surface-container-high)] data-[peeked=true]:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition-colors"
            >
              <td className="relative px-8 py-4 font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] group-hover:before:absolute group-hover:before:left-0 group-hover:before:top-0 group-hover:before:bottom-0 group-hover:before:w-2 group-hover:before:bg-[var(--md-sys-color-on-surface)] group-data-[active=true]:before:absolute group-data-[active=true]:before:left-0 group-data-[active=true]:before:top-0 group-data-[active=true]:before:bottom-0 group-data-[active=true]:before:w-2 group-data-[active=true]:before:bg-[var(--md-sys-color-on-surface)] group-data-[peeked=true]:before:absolute group-data-[peeked=true]:before:left-0 group-data-[peeked=true]:before:top-0 group-data-[peeked=true]:before:bottom-0 group-data-[peeked=true]:before:w-0.5 group-data-[peeked=true]:before:bg-[var(--md-sys-color-primary)]">
                {rfp.code}
              </td>
              <td className="px-3 py-4 text-[13px] text-[var(--md-sys-color-on-surface)] font-medium">
                {rfp.title}
              </td>
              <td className="px-3 py-4 font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                {formatDate(rfp.deadline)}
              </td>
              <td className="px-3 py-4 font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                {rfp.allowedPgWorkspaceIds.length}
              </td>
              <td className="px-3 py-4 text-right">
                <Chip label={statusLabel[rfp.status]} color={statusColor[rfp.status]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Named export so the Server Component app/(app)/rfp/page.tsx can render the
// skeleton — `RfpListTable.Skeleton` (static on a 'use client' component) is
// undefined across the RSC boundary. The static below keeps client callers working.
export function RfpListTableSkeleton() {
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
              <td className="px-8 py-4"><Skeleton className="h-3 w-24" /></td>
              <td className="px-3 py-4"><Skeleton className="h-3 w-48" /></td>
              <td className="px-3 py-4"><Skeleton className="h-3 w-20" /></td>
              <td className="px-3 py-4"><Skeleton className="h-3 w-6" /></td>
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

RfpListTable.Skeleton = RfpListTableSkeleton;
