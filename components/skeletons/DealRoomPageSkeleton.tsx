import { Skeleton } from '@/components/ui/skeleton';

/**
 * DealRoomPageSkeleton — 정식 딜룸 페이지(DealRoomFull) 로딩 폴백.
 * 셸 골격(52px 상단바 + 76px 레일 · 가운데 · lg 채팅)을 그대로 흉내 내 깜빡임을 줄인다.
 */
export function DealRoomPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 상단바 */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-5 w-16 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1">
        {/* 좌측 레일 */}
        <div className="flex w-[76px] shrink-0 flex-col items-center gap-3 border-r border-[var(--md-sys-color-outline-variant)] py-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-12" />
          ))}
        </div>
        {/* 가운데 */}
        <div className="min-w-0 flex-1 space-y-4 px-6 py-5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        {/* 우측 채팅(lg 이상) */}
        <div className="hidden w-[360px] shrink-0 flex-col gap-3 border-l border-[var(--md-sys-color-outline-variant)] p-4 lg:flex">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
