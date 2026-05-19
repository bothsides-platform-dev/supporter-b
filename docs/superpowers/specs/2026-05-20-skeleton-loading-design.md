# Skeleton Loading — Design Spec

**Date:** 2026-05-20  
**Goal:** INP 개선을 위해 페이지 이동 시 전체 페이지 스켈레톤 표시

---

## 배경

현재 앱 핵심 페이지들은 `loading.tsx`가 없어 페이지 이동 시 빈 화면이 뜨거나 "LOADING…" 텍스트만 표시된다. Next.js App Router의 `loading.tsx` + `<Suspense>`를 활용해 사용자가 인터랙션하는 즉시 레이아웃 골격을 보여줌으로써 지각적 INP를 개선한다.

---

## 범위

총 5개 라우트에 `loading.tsx` 추가:

| 라우트 | 주요 컴포넌트 |
|--------|-------------|
| `app/(app)/home/` | KanbanBoard (Buyer/PG 공통 6열) |
| `app/(app)/rfp/` | RfpListTable (탭 + 5열 테이블) |
| `app/(app)/rfp/[id]/` | RFP 상세 헤더 + BidBoard (3열) |
| `app/(app)/inbox/` | InboxList (탭 + 리스트) |
| `app/(app)/inbox/[rfpId]/` | BriefPanel + BidForm (2열 그리드) |

---

## 아키텍처

### 공유 스켈레톤 컴포넌트

위치: `components/skeletons/`

```
components/skeletons/
├── SkeletonKanbanBoard.tsx    # 칸반 N열 + 카드 M개 (홈, RFP 상세)
├── SkeletonPageHeader.tsx     # 제목 + 선택적 액션 버튼 (RFP 목록)
├── SkeletonTabs.tsx           # 탭 pill 행 (RFP 목록, 수신함)
├── SkeletonTableRows.tsx      # 테이블 헤더 + N행 (RFP 목록)
├── SkeletonInboxList.tsx      # 카드 리스트 N행 (수신함)
├── SkeletonRfpDetailHeader.tsx # ID + 제목 + 칩 + 메타 행 (RFP 상세)
├── SkeletonBriefPanel.tsx     # 좌측 340px 패널 (Bid 작성)
├── SkeletonBidForm.tsx        # 우측 카드 섹션 폼 (Bid 작성)
└── index.ts                   # re-export 모음
```

모든 컴포넌트는:
- 기존 `components/ui/skeleton.tsx`의 `<Skeleton>` primitive 사용 (`animate-pulse` + `bg-surface-container-high`)
- Server Component (no `'use client'`)
- props로 rows/cols 수 조정 가능

### loading.tsx 구성

각 `loading.tsx`는 공유 컴포넌트를 조합해 실제 페이지 레이아웃을 미러링:

**`app/(app)/home/loading.tsx`**
```tsx
import { SkeletonKanbanBoard } from '@/components/skeletons'
export default function Loading() {
  return <SkeletonKanbanBoard cols={6} cardsPerCol={3} />
}
```

**`app/(app)/rfp/loading.tsx`**
```tsx
import { SkeletonPageHeader, SkeletonTabs, SkeletonTableRows } from '@/components/skeletons'
export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <SkeletonPageHeader hasAction />
      </div>
      <div className="flex-1 px-8">
        <SkeletonTabs count={4} />
        {/* cols: 각 열의 상대 너비 (flex 비율). 마지막 열은 hasChip으로 칩 형태 */}
        <SkeletonTableRows cols={[1, 4, 2, 1, 1.5]} rows={5} hasChip />
      </div>
    </div>
  )
}
```

**`app/(app)/rfp/[id]/loading.tsx`**
```tsx
import { SkeletonRfpDetailHeader, SkeletonKanbanBoard } from '@/components/skeletons'
export default function Loading() {
  return (
    <div className="px-8 py-8 space-y-10">
      <SkeletonRfpDetailHeader />
      <SkeletonKanbanBoard cols={3} cardsPerCol={2} />
    </div>
  )
}
```

**`app/(app)/inbox/loading.tsx`**
```tsx
import { SkeletonTabs, SkeletonInboxList } from '@/components/skeletons'
export default function Loading() {
  return (
    <>
      <SkeletonTabs count={4} />
      <SkeletonInboxList rows={5} />
    </>
  )
}
```

**`app/(app)/inbox/[rfpId]/loading.tsx`**
```tsx
import { SkeletonBriefPanel, SkeletonBidForm } from '@/components/skeletons'
export default function Loading() {
  return (
    <div className="px-8 py-8 grid grid-cols-[340px_1fr] gap-12">
      <SkeletonBriefPanel />
      <SkeletonBidForm />
    </div>
  )
}
```

---

## 스타일 원칙

- MD3 디자인 시스템 준수: `bg-[var(--md-sys-color-surface-container-high)]`
- 애니메이션: `animate-pulse` (기존 Skeleton 컴포넌트 그대로)
- 형태: rounded bar는 `rounded-md`, 칩은 `rounded-full`, 카드는 `rounded-md`
- 텍스트 크기 반영: 제목은 높이 16–20px, 본문 텍스트는 11–13px 높이 bar
- 너비 변화: 행마다 85%, 75%, 90% 등 다르게 줘서 자연스럽게

---

## 테스트 계획

- TDD: `loading.tsx`는 단순 컴포넌트 조합이라 TDD 면제 범위. 단, 공유 skeleton 컴포넌트들은 각 props(rows, cols, hasAction 등)에 따라 올바른 수의 skeleton 요소를 렌더링하는지 단위 테스트 작성.
- 테스트 파일 위치: `__tests__/skeletons/SkeletonKanbanBoard.test.tsx` 등
- 수동 검증: `pnpm dev` 후 각 페이지 이동 시 스켈레톤 확인 (느린 네트워크 시뮬레이션: Chrome DevTools → Network → Slow 3G)
- `pnpm tsc --noEmit` + `pnpm lint` 통과 확인

---

## 파일 변경 목록

**신규 생성:**
- `components/skeletons/SkeletonKanbanBoard.tsx`
- `components/skeletons/SkeletonPageHeader.tsx`
- `components/skeletons/SkeletonTabs.tsx`
- `components/skeletons/SkeletonTableRows.tsx`
- `components/skeletons/SkeletonInboxList.tsx`
- `components/skeletons/SkeletonRfpDetailHeader.tsx`
- `components/skeletons/SkeletonBriefPanel.tsx`
- `components/skeletons/SkeletonBidForm.tsx`
- `components/skeletons/index.ts`
- `app/(app)/home/loading.tsx`
- `app/(app)/rfp/loading.tsx`
- `app/(app)/rfp/[id]/loading.tsx`
- `app/(app)/inbox/loading.tsx`
- `app/(app)/inbox/[rfpId]/loading.tsx`
- `__tests__/skeletons/SkeletonKanbanBoard.test.tsx`
- `__tests__/skeletons/SkeletonTableRows.test.tsx`
- `__tests__/skeletons/SkeletonInboxList.test.tsx`

**기존 파일 변경 없음** — `components/ui/skeleton.tsx` primitive만 재사용.
