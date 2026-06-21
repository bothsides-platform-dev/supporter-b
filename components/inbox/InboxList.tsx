'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDeadline } from '@/lib/format';
import { useListNavigation } from '@/lib/hooks/useListNavigation';
import { useDealRoomNav } from '@/lib/stores/deal-room-nav';
import type { MerchantTier } from '@/lib/types/bid';
import { PG_KANBAN_LABEL, type PgKanbanStage } from '@/lib/server/pg-kanban';
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPE_COLOR } from '@/lib/types/rfp';

// 칩 라벨은 PG 칸반 stage 와 동일 어휘(received→신규 …) — PG_KANBAN_LABEL 재사용.
const stageColor: Record<PgKanbanStage, ChipColor> = {
  received: 'warning', // 신규 — 보류/신규
  submitted: 'tertiary', // 견적 보냄 — 주요 진행
  won: 'tertiary', // 선정됨 — 성공/완료
  lost: 'surface', // 미선정 — 중립
};

export type InboxRow = {
  invitationId: string;
  /** Bid-aware PG kanban stage (classifyPgInvitation) — 필터·칩·행동의 단일 기준. */
  stage: PgKanbanStage;
  /** 제출된 bid id (있으면 "보낸 견적" 링크 노출). received 단계는 비어 있음. */
  bidId?: string;
  rfpId: string;
  rfpTitle: string;
  rfpDeadline: string;
  grade: string;
  /** Raw merchant-grade enum for the grade filter (label lives in `grade`). */
  gradeRaw?: MerchantTier;
  /** 계약 유형. null이면 미표시. */
  contractType?: 'new' | 'renewal' | null;
  /** 온보딩 샘플 견적 요청이면 true — '샘플' 칩 노출. */
  isSample?: boolean;
  /** 이 PG에 대해 pending 재요청이 있으면 true — 재요청 Chip 표시 트리거. */
  hasPendingRequote?: boolean;
};

export function InboxList({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // 딜룸 ‹ › 이전/다음용 목록 순서 시드(현재 정렬 기준).
  const setNavOrder = useDealRoomNav((s) => s.setOrder);
  useEffect(() => {
    setNavOrder('/inbox', rows.map((r) => r.rfpId));
  }, [rows, setNavOrder]);

  // 행 클릭/Enter → 상세 라우트로 push. 인터셉트 라우트가 목록 위에 딜룸 모달을
  // 띄우고 URL 은 /inbox/<code> 로 바뀐다(새로고침 시 정식 페이지). ?peek 대체.
  function openDealRoom(rfpId: string) {
    router.push(`/inbox/${rfpId}`);
  }

  const { active } = useListNavigation(rows.length, {
    onEnter: (i) => openDealRoom(rows[i].rfpId),
    onEdit: (i) => openDealRoom(rows[i].rfpId),
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
            <th className="px-3 py-3 text-right font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">행동</th>
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
                onClick={() => openDealRoom(row.rfpId)}
                data-active={active === i}
                className="group border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] data-[active=true]:bg-[var(--md-sys-color-surface-container-high)] data-[peeked=true]:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition-colors"
              >
                <td className="relative px-8 py-4 md-numeric text-[12px] text-[var(--md-sys-color-on-surface-variant)] group-hover:before:absolute group-hover:before:left-0 group-hover:before:top-0 group-hover:before:bottom-0 group-hover:before:w-2 group-hover:before:bg-[var(--md-sys-color-on-surface)] group-data-[active=true]:before:absolute group-data-[active=true]:before:left-0 group-data-[active=true]:before:top-0 group-data-[active=true]:before:bottom-0 group-data-[active=true]:before:w-2 group-data-[active=true]:before:bg-[var(--md-sys-color-on-surface)] group-data-[peeked=true]:before:absolute group-data-[peeked=true]:before:left-0 group-data-[peeked=true]:before:top-0 group-data-[peeked=true]:before:bottom-0 group-data-[peeked=true]:before:w-0.5 group-data-[peeked=true]:before:bg-[var(--md-sys-color-primary)]">
                  {row.rfpId}
                </td>
                <td className="px-3 py-4 text-[13px] text-[var(--md-sys-color-on-surface)] font-medium">
                  <span className="flex items-center gap-1.5">
                    {row.isSample && <Chip label="샘플" color="surface" />}
                    {row.contractType && (
                      <Chip
                        label={CONTRACT_TYPE_LABELS[row.contractType]}
                        color={CONTRACT_TYPE_COLOR[row.contractType]}
                      />
                    )}
                    {/* 재요청은 재제출로만 resolve — 종결(won/lost) 후엔 응답 불가라 숨김. */}
                    {row.hasPendingRequote && row.stage !== 'won' && row.stage !== 'lost' && (
                      <Chip label="재요청" color="warning" />
                    )}
                    {row.rfpTitle}
                  </span>
                </td>
                <td className="px-3 py-4 font-mono text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  {row.grade}
                </td>
                <td className={`px-3 py-4 md-numeric text-[12px] ${isUrgent ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                  {daysLeft}
                </td>
                <td className="px-3 py-4 text-right">
                  <Chip
                    label={PG_KANBAN_LABEL[row.stage]}
                    color={stageColor[row.stage]}
                  />
                </td>
                <td className="px-3 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  {row.stage === 'received' ? (
                    <Link
                      href={`/inbox/${row.rfpId}`}
                      className="inline-flex items-center rounded-[6px] bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
                    >
                      견적 작성
                    </Link>
                  ) : row.bidId ? (
                    <Link
                      href={`/inbox/${row.rfpId}`}
                      className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
                    >
                      보낸 견적
                    </Link>
                  ) : (
                    <span className="font-mono text-[11px] text-[var(--md-sys-color-outline)]">—</span>
                  )}
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
            <th className="px-3 py-3 text-right"><Skeleton className="h-2 w-10 ml-auto" /></th>
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
              <td className="px-3 py-4 text-right">
                <Skeleton className="h-7 w-16 rounded-[6px] ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

InboxList.Skeleton = InboxListSkeleton;
