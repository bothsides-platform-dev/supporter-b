# CLS 제거 — 컴포넌트 레벨 Suspense 설계 스펙

**Date:** 2026-05-21  
**Goal:** 라우터 스켈레톤을 실제 컴포넌트와 동일한 DOM 구조로 교체해 CLS를 구조적으로 제거

---

## 배경

M8에서 구현된 `loading.tsx` + `components/skeletons/` 패턴은 route-level Suspense로 빈 화면을 제거했지만, 스켈레톤이 `<div>` 기반인 반면 실제 컴포넌트는 `<table>/<tr>/<td>` 또는 CSS Grid를 사용해 치수 불일치로 CLS가 발생한다.

- 테이블 행: 스켈레톤 `py-3` ≈ 36px, 실제 `py-4` ≈ 52px (△16px)
- KanbanCard: 스켈레톤 ≈ 24px, 실제 ≈ 80px (△56px)

근본 원인: 스켈레톤이 컴포넌트와 분리된 별도 파일에 있어 DOM 구조를 미러링하기 어렵고 drift가 발생한다.

---

## 해결 방향

1. **`loading.tsx`** — 모든 파일을 "LOADING…" 텍스트로 단순화 (route transition 표시용)
2. **`Component.Skeleton`** — 각 컴포넌트 파일 안에 동일 DOM 구조의 skeleton 정의 (co-located)
3. **Async Loader RSC** — 데이터 fetch를 `page.tsx`에서 Loader 컴포넌트로 분리
4. **`page.tsx` Suspense** — `<Suspense fallback={<Component.Skeleton />}>` + Loader 조합

---

## 아키텍처

### RouteLoadingIndicator (신규)

```
components/ui/RouteLoadingIndicator.tsx
```

"LOADING…" 텍스트, 페이지 중앙 정렬, MD3 `body-medium` 타입, `on-surface-variant` 색상.  
현재 `RouteModalLoading`과 동일한 시각 패턴이지만 페이지 레벨용.

```tsx
export default function RouteLoadingIndicator() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="md-typescale-body-medium text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </span>
    </div>
  )
}
```

### Component.Skeleton 패턴

각 컴포넌트 파일에 `.Skeleton` 정적 프로퍼티 추가. **핵심 원칙: 실제 컴포넌트와 동일한 최상위 태그·클래스·padding 사용.**

```tsx
// components/rfp/RfpListTable.tsx
export function RfpListTable({ rfps }: Props) { ... }

RfpListTable.Skeleton = function RfpListTableSkeleton() {
  return (
    <table className="w-full">         {/* 동일 <table> */}
      <thead>
        <tr className="border-b ...">
          <th className="px-8 py-3 ..."><Skeleton className="h-2 w-8" /></th>
          {/* 실제 th와 동일 padding */}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 5 }).map((_, i) => (
          <tr key={i} className="border-b">
            <td className="px-8 py-4">  {/* py-4 — 실제와 동일 */}
              <Skeleton className="h-3 w-20" />
            </td>
            ...
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

### Async Loader RSC 패턴

```tsx
// app/(app)/rfp/page.tsx
export default async function RfpPage() {
  const session = await auth()  // auth()만 — 빠름
  const wsId = session.user.workspaceId
  return (
    <div className="flex flex-col h-full">
      <RfpPageHeader wsId={wsId} />  {/* 헤더는 auth 즉시 렌더링 */}
      <Suspense fallback={<RfpListTable.Skeleton />}>
        <RfpListTableLoader wsId={wsId} />
      </Suspense>
    </div>
  )
}

// 같은 파일 또는 components/rfp/RfpListTableLoader.tsx
async function RfpListTableLoader({ wsId }: { wsId: string }) {
  const rfps = await (await getRfpRepo()).findByBuyerWs(wsId)
  return <RfpListTable rfps={rfps} />
}
```

---

## 적용 범위

### loading.tsx 변경 (10개)

모두 `RouteLoadingIndicator` 단일 re-export로 교체:

| 파일 | 현재 | 변경 후 |
|------|------|---------|
| `home/loading.tsx` | SkeletonKanbanBoard | RouteLoadingIndicator |
| `rfp/loading.tsx` | SkeletonPageHeader + SkeletonTableRows | RouteLoadingIndicator |
| `rfp/[id]/loading.tsx` | SkeletonRfpDetailHeader + SkeletonTableRows | RouteLoadingIndicator |
| `rfp/[id]/award/loading.tsx` | 커스텀 SectionRows | RouteLoadingIndicator |
| `inbox/loading.tsx` | SkeletonPageHeader + SkeletonTableRows | RouteLoadingIndicator |
| `inbox/[rfpId]/loading.tsx` | SkeletonBriefPanel + SkeletonBidForm | RouteLoadingIndicator |
| `inbox/[rfpId]/submitted/loading.tsx` | 커스텀 SectionRows | RouteLoadingIndicator |
| `settings/profile/loading.tsx` | 커스텀 Skeleton bars | RouteLoadingIndicator |
| `settings/members/loading.tsx` | 커스텀 Skeleton bars | RouteLoadingIndicator |
| `settings/notifications/loading.tsx` | 커스텀 Skeleton bars | RouteLoadingIndicator |

**유지 (변경 없음):**
- `@modal/(.)rfp/[id]/loading.tsx` — `RouteModalLoading` 유지
- `@modal/(.)inbox/[rfpId]/loading.tsx` — `RouteModalLoading` 유지

### Component.Skeleton + Loader 추가 (5개 페이지)

| 페이지 | 컴포넌트 | Skeleton 구조 | Loader |
|--------|---------|--------------|--------|
| `/home` | `KanbanBoard` | 동일 `grid grid-cols-6` + 카드 구조 | `BuyerHome`/`PgHome` 이미 async RSC → page.tsx에서 Suspense로 감싸기만 |
| `/rfp` | `RfpListTable` | 동일 `<table>` + `py-4` rows | `RfpListTableLoader` (신규) |
| `/inbox` | `InboxList` | 동일 `<table>` 구조 | `InboxListLoader` (신규) |
| `/rfp/[id]` | `RfpDetailContent` | 동일 `space-y-10` 섹션 + 내부 구조 | `RfpDetailLoader` (신규) |
| `/inbox/[rfpId]` | `PgRfpDetailContent` | 동일 `grid-cols-[340px_1fr]` | `PgRfpDetailLoader` (신규) |

**설정 페이지 3개**: loading.tsx만 변경, 컴포넌트 Suspense 미적용 (form 기반, CLS 영향 미미).  
**award/submitted 페이지**: loading.tsx만 변경, 컴포넌트 Suspense 미적용 (단순 조회).

---

## 파일 변경 목록

**신규 생성:**
- `components/ui/RouteLoadingIndicator.tsx`
- `components/home/KanbanBoard.tsx` 내 `KanbanBoard.Skeleton` 추가
- `components/rfp/RfpListTable.tsx` 내 `RfpListTable.Skeleton` 추가
- `components/inbox/InboxList.tsx` 내 `InboxList.Skeleton` 추가
- `components/rfp/RfpDetailContent.tsx` 내 `RfpDetailContent.Skeleton` 추가
- `components/inbox/PgRfpDetailContent.tsx` 내 `PgRfpDetailContent.Skeleton` 추가
- Loader 함수 (각 page.tsx 내 또는 별도 파일):
  - `RfpListTableLoader`
  - `InboxListLoader`
  - `RfpDetailLoader`
  - `PgRfpDetailLoader`

**수정:**
- `app/(app)/home/page.tsx` — BuyerHome/PgHome을 `<Suspense>` 로 감쌈
- `app/(app)/rfp/page.tsx` — Loader + Suspense 패턴으로 재구성
- `app/(app)/inbox/page.tsx` — 동일
- `app/(app)/rfp/[id]/page.tsx` — 동일
- `app/(app)/inbox/[rfpId]/page.tsx` — 동일
- loading.tsx 10개 — RouteLoadingIndicator re-export로 교체

**삭제:**
- `components/skeletons/` 디렉토리 전체 (8개 컴포넌트 + index.ts)
- 연관 테스트 파일: `__tests__/skeletons/` 디렉토리

---

## TDD 적용

`Component.Skeleton`은 시각/스타일 전용이므로 **TDD 면제** (CLAUDE.md "시각/스타일만 손대는 변경").  
단, Loader RSC(데이터 fetch 로직 있음)와 page.tsx Suspense 구조 변경은 **기존 e2e 테스트로 회귀 검증**.

추가 단위 테스트 불필요 — 기존 `__tests__/` 내 페이지 테스트가 렌더링을 커버함.

---

## 검증 계획

1. `pnpm tsc --noEmit` — 타입 에러 없음
2. `pnpm test` — 기존 테스트 전체 통과
3. `pnpm dev` + Chrome DevTools → Network → "Slow 3G" 시뮬레이션:
   - 각 페이지 이동 시 "LOADING…" 텍스트 표시 확인
   - 데이터 로드 후 레이아웃 이동 없음 확인 (Performance 탭 CLS ≈ 0)
4. `pnpm e2e` — 기존 e2e 시나리오 통과
