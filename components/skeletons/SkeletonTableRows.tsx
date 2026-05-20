import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  cols?: number[]   // 각 열의 flex 비율 (예: [1, 4, 2, 1, 1.5])
  rows?: number
  hasChip?: boolean // 마지막 열을 rounded-full 칩 스타일로 렌더
}

const ROW_WIDTHS = ['w-4/5', 'w-3/4', 'w-9/10'] as const

export function SkeletonTableRows({
  cols = [1, 4, 2, 1, 1.5],
  rows = 5,
  hasChip = false,
}: Props) {
  return (
    <div>
      {/* 테이블 헤더 */}
      <div className="flex gap-3 px-8 py-2 border-b border-[var(--md-sys-color-outline-variant)]">
        {cols.map((flex, i) => (
          <Skeleton key={`header-${i}`} className="h-2" style={{ flex }} />
        ))}
      </div>
      {/* 데이터 행 */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={`row-${ri}`}
          data-testid="skeleton-table-row"
          className="flex items-center gap-3 px-8 py-3 border-b border-[var(--md-sys-color-outline-variant)]"
        >
          {cols.map((flex, ci) => {
            const isLast = ci === cols.length - 1
            if (isLast && hasChip) {
              return (
                <Skeleton
                  key={`chip-${ri}-${ci}`}
                  data-testid="skeleton-table-chip"
                  className="h-5 w-14 rounded-full ml-auto"
                />
              )
            }
            return (
              <Skeleton
                key={`cell-${ri}-${ci}`}
                className={`h-3 ${ROW_WIDTHS[ri % ROW_WIDTHS.length]}`}
                style={{ flex }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
