import { Skeleton } from '@/components/ui/skeleton';

/**
 * /contract-templates 로딩 스켈레톤 — 실제 화면과 같은 뼈대(PageHeader 스트립 +
 * 리스트 행)를 그려 내비게이션 중 이전 화면이 멈춘 채 남지 않게 한다.
 * force-dynamic + 서버 액션 await 라 loading.tsx 없이는 전환이 빈 채로 걸린다.
 */
export function ContractTemplatesPageSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* PageHeader 스트립(제목 + 설명 + 우측 액션) 미러 */}
      <div className="border-b border-[var(--md-sys-color-outline-variant)] px-6">
        <div className="flex items-center gap-3 pt-3">
          <Skeleton className="h-5 w-28" />
          <div className="ml-auto">
            <Skeleton className="h-7 w-32 rounded-sm" />
          </div>
        </div>
        <div className="pb-3 pt-1">
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
      </div>

      {/* 목록 행 미러 — 이름·생성일 + 우측 행 액션(수정·이름 변경·삭제) */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {(['w-40', 'w-52', 'w-36'] as const).map((nameWidth, i) => (
            <div key={i} data-testid="skeleton-row" className="flex items-center justify-between gap-2 py-4">
              <div className="space-y-1.5">
                <Skeleton className={`h-3.5 ${nameWidth}`} />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <div className="flex shrink-0 gap-1">
                <Skeleton className="h-7 w-10 rounded-sm" />
                <Skeleton className="h-7 w-16 rounded-sm" />
                <Skeleton className="h-7 w-10 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
