'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { useListNavigation } from '@/lib/hooks/useListNavigation';
import { useDealRoomNav } from '@/lib/stores/deal-room-nav';
import { formatDate } from '@/lib/format';
import type { RFP } from '@/lib/types/rfp';
import { RFP_STATUS_CHIP } from '@/lib/rfp-status';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteSampleRfpAction } from '@/lib/server/actions/onboarding/deleteSampleRfpAction';
import { toast } from '@/lib/toast';

type Props = { rfps: RFP[] };

export function RfpListTable({ rfps }: Props) {
  const router = useRouter();
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // 딜룸 ‹ › 이전/다음용 목록 순서 시드(현재 정렬 기준).
  const setNavOrder = useDealRoomNav((s) => s.setOrder);
  useEffect(() => {
    setNavOrder('/rfp', rfps.map((r) => r.code));
  }, [rfps, setNavOrder]);
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 행 클릭/Enter → 상세 라우트로 push. 인터셉트 라우트(@modal/(.)[id])가
  // 목록 위에 딜룸 모달을 띄우고 URL 은 /rfp/<code> 로 바뀐다(새로고침 시 정식
  // 페이지). 과거 ?peek 패널을 대체한다.
  function openDealRoom(code: string) {
    router.push(`/rfp/${code}`);
  }

  const { active } = useListNavigation(rfps.length, {
    onEnter: (i) => openDealRoom(rfps[i].code),
    onEdit: (i) => openDealRoom(rfps[i].code),
  });

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <>
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
              onClick={() => openDealRoom(rfp.code)}
              data-active={active === i}
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
                <div className="inline-flex items-center gap-2">
                  {rfp.isSample && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteCode(rfp.code);
                      }}
                      className="font-mono text-[10px] text-[var(--md-sys-color-error)] hover:underline"
                      aria-label="샘플 삭제"
                    >
                      삭제
                    </button>
                  )}
                  {rfp.isSample && <Chip label="샘플" color="surface" />}
                  <Chip label={RFP_STATUS_CHIP[rfp.status].label} color={RFP_STATUS_CHIP[rfp.status].color} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      <ConfirmDialog
        open={deleteCode !== null}
        onOpenChange={(o) => !busy && !o && setDeleteCode(null)}
        title="샘플 견적 요청을 삭제할까요?"
        description="삭제하면 다시 표시되지 않아요."
        confirmLabel="삭제"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          if (!deleteCode) return;
          setBusy(true);
          const r = await deleteSampleRfpAction({ code: deleteCode });
          setBusy(false);
          if (!r.ok) {
            toast(`삭제하지 못했어요 — ${r.error}`, { type: 'error' });
            return;
          }
          setDeleteCode(null);
          toast('샘플 견적 요청을 삭제했어요.');
          router.refresh();
        }}
      />
    </>
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
