'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { useListNavigation } from '@/lib/hooks/useListNavigation';
import { useIsMac, formatModifierShortcut } from '@/lib/hooks/usePlatform';
import { formatDate } from '@/lib/format';
import type { RFP } from '@/lib/types/rfp';

const statusLabel: Record<string, string> = {
  draft: '임시저장',
  sent: '발송됨',
  closed: '마감',
  awarded: '계약완료',
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
  const isMac = useIsMac();
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const { active } = useListNavigation(rfps.length, {
    onEnter: (i) => router.push(`/rfp/${rfps[i].id}`),
    onEdit: (i) => router.push(`/rfp/${rfps[i].id}`),
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
              onClick={() => router.push(`/rfp/${rfp.id}`)}
              data-active={active === i}
              className="group border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] data-[active=true]:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition-colors"
            >
              <td className="relative px-8 py-4 font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] group-hover:before:absolute group-hover:before:left-0 group-hover:before:top-0 group-hover:before:bottom-0 group-hover:before:w-2 group-hover:before:bg-[var(--md-sys-color-on-surface)] group-data-[active=true]:before:absolute group-data-[active=true]:before:left-0 group-data-[active=true]:before:top-0 group-data-[active=true]:before:bottom-0 group-data-[active=true]:before:w-2 group-data-[active=true]:before:bg-[var(--md-sys-color-on-surface)]">
                {rfp.id}
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
      <div className="px-8 py-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center gap-4 font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-outline)]">
        <span>
          <kbd className="text-[var(--md-sys-color-on-surface-variant)]">J</kbd> /{' '}
          <kbd className="text-[var(--md-sys-color-on-surface-variant)]">K</kbd> 이동
        </span>
        <span>
          <kbd className="text-[var(--md-sys-color-on-surface-variant)]">Enter</kbd> 상세
        </span>
        <span>
          <kbd className="text-[var(--md-sys-color-on-surface-variant)]">{formatModifierShortcut('N', isMac)}</kbd> 신규
        </span>
      </div>
    </div>
  );
}
