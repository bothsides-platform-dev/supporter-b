import { Skeleton } from '@/components/ui/skeleton';

export function SubmittedPageSkeleton() {
  return (
    <div className="px-8 py-8 space-y-10">
      <div>
        <Skeleton className="h-2.5 w-20 mb-3" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-3 w-80 mt-2" />
        <Skeleton className="h-2.5 w-48 mt-1" />
      </div>

      {/* 제안 요청: RFP, 제목, 등급, 마감 */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-2.5 w-20" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {(['w-6', 'w-8', 'w-8', 'w-8'] as const).map((lw, i) => (
            <div key={i} className="py-2.5 flex items-baseline justify-between">
              <Skeleton className={`h-2.5 ${lw}`} />
              <Skeleton className={`h-3 ${i === 1 ? 'w-48' : i === 0 ? 'w-24' : 'w-20'}`} />
            </div>
          ))}
        </div>
      </div>

      {/* 제출 제안: 정산 주기, 보증금, 셋업비, 월최저수수료, 계좌이체, 간편결제 */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-2.5 w-20" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {(['w-16', 'w-10', 'w-12', 'w-20', 'w-14', 'w-16'] as const).map((lw, i) => (
            <div key={i} className="py-2.5 flex items-baseline justify-between">
              <Skeleton className={`h-2.5 ${lw}`} />
              <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-20' : 'w-16'}`} />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="h-3 w-20" />
    </div>
  );
}
