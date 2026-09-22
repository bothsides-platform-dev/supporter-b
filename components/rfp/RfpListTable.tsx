'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Chip } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { useListNavigation } from '@/lib/hooks/useListNavigation';
import { useDealRoomNav } from '@/lib/stores/deal-room-nav';
import { formatDate } from '@/lib/utils/format';
import type { RFP } from '@/lib/types/rfp';
import { RFP_STATUS_CHIP } from '@/lib/rfp/rfp-status';
import { isRfpBidWindowOpen } from '@/lib/rfp/bid-window';
import type { PgReview } from '@/lib/rfp/pg-matching';

export type BuyerListProgress = { bidCount: number; reviewStatus?: PgReview['status'] };

type Props = {
  rfps: RFP[];
  // 랜딩 데모: 행 열기를 인플레이스로 가로챈다. 없으면 기존대로 상세 라우트로 push.
  onOpenRfp?: (code: string) => void;
  progressByRfpId?: Record<string, BuyerListProgress>;
  now?: string;
};

function rowProgress(rfp: RFP, progress: BuyerListProgress | undefined, now: number) {
  const nextPg = progress?.reviewStatus === 'rejected' || progress?.reviewStatus === 'withdrawn';
  if (rfp.status === 'sent' && !isRfpBidWindowOpen(rfp, now)) return { label: '마감', color: 'surface' as const, action: progress?.bidCount ? '견적 확인하기' : nextPg ? '다음 PG사 선택' : '결과 확인하기' };
  if (rfp.status === 'sent' && (progress?.bidCount || progress?.reviewStatus === 'quoted')) return { label: '견적 도착', color: 'tertiary' as const, action: '견적 확인하기' };
  if (rfp.status === 'sent' && nextPg) return { label: '다음 PG사 선택', color: 'warning' as const, action: '상담 이어가기' };
  if (rfp.status === 'sent' && progress?.reviewStatus === 'reviewing') return { label: 'PG 검토 중', color: 'warning' as const, action: '상담 현황 보기' };
  if (rfp.status === 'sent' && progress?.reviewStatus === 'requested') return { label: '상담 요청 완료', color: 'primary' as const, action: '상담 현황 보기' };
  return { ...RFP_STATUS_CHIP[rfp.status], action: rfp.status === 'awarded' ? '계약 확인하기' : rfp.status === 'sent' ? '요청 현황 보기' : '결과 보기' };
}

export function RfpListTable({ rfps, onOpenRfp, progressByRfpId, now }: Props) {
  const router = useRouter();
  const [mountedAt] = useState(() => Date.now());
  const currentTime = now ? new Date(now).getTime() : mountedAt;
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // 딜룸 ‹ › 이전/다음용 목록 순서 시드(현재 정렬 기준).
  const setNavOrder = useDealRoomNav((s) => s.setOrder);
  useEffect(() => {
    setNavOrder('/rfp', rfps.map((r) => r.code));
  }, [rfps, setNavOrder]);

  // 행 클릭/Enter → 상세 라우트로 push. 인터셉트 라우트(@modal/(.)[id])가
  // 목록 위에 딜룸 모달을 띄우고 URL 은 /rfp/<code> 로 바뀐다(새로고침 시 정식
  // 페이지). 과거 ?peek 패널을 대체한다.
  function openDealRoom(code: string) {
    if (onOpenRfp) {
      onOpenRfp(code);
      return;
    }
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
      <table className="w-full border-collapse max-md:block">
        <thead className="sticky top-0 bg-[var(--md-sys-color-surface)] max-md:sr-only">
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            <th className="px-8 py-3 text-left md-label-small text-[var(--md-sys-color-on-surface-variant)] font-normal">
              번호
            </th>
            <th className="px-3 py-3 text-left md-label-small text-[var(--md-sys-color-on-surface-variant)] font-normal">
              제목
            </th>
            <th className="px-3 py-3 text-left md-label-small text-[var(--md-sys-color-on-surface-variant)] font-normal">
              마감
            </th>
            <th className="px-3 py-3 text-left md-label-small text-[var(--md-sys-color-on-surface-variant)] font-normal">
              진행 상태
            </th>
            <th className="px-3 py-3 text-right md-label-small text-[var(--md-sys-color-on-surface-variant)] font-normal">
              다음 행동
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block">
          {rfps.map((rfp, i) => {
            const progress = rowProgress(rfp, progressByRfpId?.[rfp.id], currentTime);
            return (
            <tr
              key={rfp.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onClick={() => openDealRoom(rfp.code)}
              data-active={active === i}
              className="group cursor-pointer border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] data-[active=true]:bg-[var(--md-sys-color-surface-container-high)] transition-colors max-md:mx-3 max-md:my-2 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-2 max-md:rounded-[6px] max-md:border max-md:px-4 max-md:py-3"
            >
              <td className="px-8 py-4 md-numeric text-[12px] text-[var(--md-sys-color-on-surface-variant)] max-md:order-2 max-md:p-0">
                {rfp.code}
              </td>
              <td className="px-3 py-4 text-[14px] text-[var(--md-sys-color-on-surface)] font-medium max-md:order-1 max-md:col-span-2 max-md:min-w-0 max-md:p-0">
                <Link href={`/rfp/${rfp.code}`} aria-label={`${rfp.title} · ${progress.label} · ${progress.action}`} className="break-words rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]" onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); openDealRoom(rfp.code); }}>
                  {rfp.title}
                </Link>
              </td>
              <td className="px-3 py-4 md-numeric text-[12px] text-[var(--md-sys-color-on-surface-variant)] max-md:order-3 max-md:p-0 max-md:text-right">
                {formatDate(rfp.deadline)}
              </td>
              <td className="px-3 py-4 max-md:order-4 max-md:p-0">
                <Chip label={progress.label} color={progress.color} />
              </td>
              <td className="px-3 py-4 text-right text-[13px] text-[var(--md-sys-color-primary)] max-md:order-5 max-md:p-0">
                {progress.action}
              </td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
    </>
  );
}

// Named export so the Server Component app/(app)/rfp/page.tsx can render the
// skeleton — `RfpListTable.Skeleton` (static on a 'use client' component) is
// undefined across the RSC boundary. The static below keeps client callers working.
export function RfpListTableSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-2 px-3 py-2 md:hidden" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-4 py-3">
            <Skeleton className="col-span-2 h-4 w-3/4" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <table className="hidden w-full border-collapse md:table">
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
