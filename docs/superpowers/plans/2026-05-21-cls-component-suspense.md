# CLS 제거 — 컴포넌트 레벨 Suspense 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각 컴포넌트에 `.Skeleton` 정적 프로퍼티를 추가하고, 데이터 fetch를 Loader RSC로 분리해 Suspense fallback이 실제 컴포넌트와 동일한 DOM 구조를 갖도록 해 CLS를 구조적으로 제거한다.

**Architecture:** `page.tsx`는 `auth()` 후 즉시 렌더링. 데이터 fetch는 `<ComponentLoader>`(async RSC)가 담당. `<Suspense fallback={<Component.Skeleton />}>` 안에서 전환. `loading.tsx`는 "LOADING…" 텍스트로 단순화.

**Tech Stack:** Next.js App Router, React Suspense, Tailwind v4 CSS Variables, `components/ui/skeleton.tsx` primitive

---

## 파일 구조 맵

**신규 생성:**
- `components/ui/RouteLoadingIndicator.tsx`

**수정 (Skeleton 추가):**
- `components/rfp/RfpListTable.tsx`
- `components/inbox/InboxList.tsx`
- `components/home/KanbanBoard.tsx`
- `components/rfp/RfpDetailContent.tsx`
- `components/inbox/PgRfpDetailContent.tsx`

**수정 (page.tsx — Suspense + Loader):**
- `app/(app)/rfp/page.tsx`
- `app/(app)/inbox/page.tsx`
- `app/(app)/home/page.tsx`
- `app/(app)/rfp/[id]/page.tsx`
- `app/(app)/inbox/[rfpId]/page.tsx`

**수정 (loading.tsx 10개 — RouteLoadingIndicator로 교체):**
- `app/(app)/home/loading.tsx`
- `app/(app)/rfp/loading.tsx`
- `app/(app)/rfp/[id]/loading.tsx`
- `app/(app)/rfp/[id]/award/loading.tsx`
- `app/(app)/inbox/loading.tsx`
- `app/(app)/inbox/[rfpId]/loading.tsx`
- `app/(app)/inbox/[rfpId]/submitted/loading.tsx`
- `app/(app)/settings/profile/loading.tsx`
- `app/(app)/settings/members/loading.tsx`
- `app/(app)/settings/notifications/loading.tsx`

**삭제:**
- `components/skeletons/` 디렉토리 전체
- `__tests__/skeletons/` 디렉토리 전체

---

## Task 1: RouteLoadingIndicator 컴포넌트 생성

**Files:**
- Create: `components/ui/RouteLoadingIndicator.tsx`

TDD 면제 — 시각/스타일 전용 컴포넌트.

- [ ] **Step 1: 파일 생성**

```tsx
// components/ui/RouteLoadingIndicator.tsx
export default function RouteLoadingIndicator() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add components/ui/RouteLoadingIndicator.tsx
git commit -m "feat(ui): RouteLoadingIndicator 공용 페이지 로딩 표시 컴포넌트 추가"
```

---

## Task 2: loading.tsx 10개 교체

**Files:**
- Modify: `app/(app)/home/loading.tsx`
- Modify: `app/(app)/rfp/loading.tsx`
- Modify: `app/(app)/rfp/[id]/loading.tsx`
- Modify: `app/(app)/rfp/[id]/award/loading.tsx`
- Modify: `app/(app)/inbox/loading.tsx`
- Modify: `app/(app)/inbox/[rfpId]/loading.tsx`
- Modify: `app/(app)/inbox/[rfpId]/submitted/loading.tsx`
- Modify: `app/(app)/settings/profile/loading.tsx`
- Modify: `app/(app)/settings/members/loading.tsx`
- Modify: `app/(app)/settings/notifications/loading.tsx`

TDD 면제 — 시각/스타일 전용.

- [ ] **Step 1: 10개 파일 내용을 모두 동일하게 교체**

각 파일의 기존 내용을 전부 지우고 아래 단일 줄로 교체:

```tsx
export { default } from '@/components/ui/RouteLoadingIndicator';
```

이 내용으로 교체할 파일 목록:
1. `app/(app)/home/loading.tsx`
2. `app/(app)/rfp/loading.tsx`
3. `app/(app)/rfp/[id]/loading.tsx`
4. `app/(app)/rfp/[id]/award/loading.tsx`
5. `app/(app)/inbox/loading.tsx`
6. `app/(app)/inbox/[rfpId]/loading.tsx`
7. `app/(app)/inbox/[rfpId]/submitted/loading.tsx`
8. `app/(app)/settings/profile/loading.tsx`
9. `app/(app)/settings/members/loading.tsx`
10. `app/(app)/settings/notifications/loading.tsx`

**변경하지 않는 파일:**
- `app/(app)/@modal/(.)rfp/[id]/loading.tsx` — RouteModalLoading 유지
- `app/(app)/@modal/(.)inbox/[rfpId]/loading.tsx` — RouteModalLoading 유지

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/\(app\)/home/loading.tsx \
        app/\(app\)/rfp/loading.tsx \
        "app/(app)/rfp/[id]/loading.tsx" \
        "app/(app)/rfp/[id]/award/loading.tsx" \
        app/\(app\)/inbox/loading.tsx \
        "app/(app)/inbox/[rfpId]/loading.tsx" \
        "app/(app)/inbox/[rfpId]/submitted/loading.tsx" \
        "app/(app)/settings/profile/loading.tsx" \
        "app/(app)/settings/members/loading.tsx" \
        "app/(app)/settings/notifications/loading.tsx"
git commit -m "refactor(loading): 모든 route loading.tsx를 RouteLoadingIndicator로 단순화"
```

---

## Task 3: RfpListTable.Skeleton + rfp/page.tsx 업데이트

**Files:**
- Modify: `components/rfp/RfpListTable.tsx`
- Modify: `app/(app)/rfp/page.tsx`

TDD 면제 — Skeleton은 시각 전용, page.tsx는 컴포넌트 조립.

- [ ] **Step 1: RfpListTable.tsx 상단에 Skeleton import 추가**

파일 상단 import 블록 끝에 추가:
```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

- [ ] **Step 2: 파일 끝(export 이후)에 Skeleton 정적 프로퍼티 추가**

`RfpListTable` 함수 선언 닫힘 `}` 뒤에 다음을 추가:

```tsx
RfpListTable.Skeleton = function RfpListTableSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-[var(--md-sys-color-surface)]">
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            <th className="px-8 py-3"><Skeleton className="h-2 w-8" /></th>
            <th className="px-3 py-3"><Skeleton className="h-2 w-12" /></th>
            <th className="px-3 py-3"><Skeleton className="h-2 w-8" /></th>
            <th className="px-3 py-3"><Skeleton className="h-2 w-8" /></th>
            <th className="px-3 py-3"><Skeleton className="h-2 w-8 ml-auto" /></th>
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
};
```

- [ ] **Step 3: rfp/page.tsx 전체 교체**

```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FileTextIcon } from '@/components/icons';
import { RfpListTable } from '@/components/rfp/RfpListTable';
import { auth } from '@/auth';
import { getRfpRepo } from '@/lib/server/repositories/factory';

export const dynamic = 'force-dynamic';

export default async function RfpListPage() {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect('/login?next=/rfp');
  }

  const wsId = session.user.workspaceId;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <div>
          <Label size="md" muted={false}>RFP — 제안 요청</Label>
          <h1 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] mt-1">
            제안 요청 목록
          </h1>
        </div>
        <Link href="/rfp/new">
          <Button size="sm">+ 신규 제안</Button>
        </Link>
      </div>
      <Suspense fallback={<RfpListTable.Skeleton />}>
        <RfpListTableLoader wsId={wsId} />
      </Suspense>
    </div>
  );
}

async function RfpListTableLoader({ wsId }: { wsId: string }) {
  const rfps = await (await getRfpRepo()).findByBuyerWs(wsId);
  if (rfps.length === 0) {
    return (
      <EmptyState
        icon={<FileTextIcon size={32} />}
        title="발송된 제안 요청이 없습니다."
        description="새로운 제안 요청을 작성해 PG사에 발송하세요."
        action={
          <Link href="/rfp/new">
            <Button size="sm">+ 신규 제안</Button>
          </Link>
        }
      />
    );
  }
  return <RfpListTable rfps={rfps} />;
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/RfpListTable.tsx "app/(app)/rfp/page.tsx"
git commit -m "feat(rfp): RfpListTable.Skeleton 추가 및 rfp/page 컴포넌트 레벨 Suspense 적용"
```

---

## Task 4: InboxList.Skeleton + inbox/page.tsx 업데이트

**Files:**
- Modify: `components/inbox/InboxList.tsx`
- Modify: `app/(app)/inbox/page.tsx`

TDD 면제.

- [ ] **Step 1: InboxList.tsx 상단에 Skeleton import 추가**

기존 import 블록 끝에 추가:
```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

- [ ] **Step 2: InboxList.tsx 파일 끝에 Skeleton 정적 프로퍼티 추가**

`InboxList` 함수 선언 닫힘 `}` 뒤에 추가:

```tsx
InboxList.Skeleton = function InboxListSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <div>
          <Skeleton className="h-2 w-32 mb-2" />
          <Skeleton className="h-5 w-36 mt-1" />
        </div>
        <Skeleton className="h-3 w-8" />
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[var(--md-sys-color-surface)]">
            <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
              <th className="px-8 py-3"><Skeleton className="h-2 w-8" /></th>
              <th className="px-3 py-3"><Skeleton className="h-2 w-12" /></th>
              <th className="px-3 py-3"><Skeleton className="h-2 w-8" /></th>
              <th className="px-3 py-3"><Skeleton className="h-2 w-8" /></th>
              <th className="px-3 py-3"><Skeleton className="h-2 w-8 ml-auto" /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--md-sys-color-outline-variant)]">
                <td className="px-8 py-4"><Skeleton className="h-3 w-24" /></td>
                <td className="px-3 py-4"><Skeleton className="h-3 w-48" /></td>
                <td className="px-3 py-4"><Skeleton className="h-3 w-12" /></td>
                <td className="px-3 py-4"><Skeleton className="h-3 w-16" /></td>
                <td className="px-3 py-4 text-right">
                  <Skeleton className="h-5 w-14 rounded-full ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: inbox/page.tsx 전체 교체**

```tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getInvitationRepo } from '@/lib/server/repositories/factory';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { InboxList } from '@/components/inbox/InboxList';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/inbox');
  }

  const wsId = session.user.workspaceId;

  return (
    <Suspense fallback={<InboxList.Skeleton />}>
      <InboxListLoader wsId={wsId} />
    </Suspense>
  );
}

async function InboxListLoader({ wsId }: { wsId: string }) {
  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(wsId);

  const rows = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpId: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
    grade: rfp.bizProfile?.grade ? GRADE_LABELS[rfp.bizProfile.grade] : '—',
  }));

  return <InboxList rows={rows} />;
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/InboxList.tsx "app/(app)/inbox/page.tsx"
git commit -m "feat(inbox): InboxList.Skeleton 추가 및 inbox/page 컴포넌트 레벨 Suspense 적용"
```

---

## Task 5: KanbanBoard.Skeleton + home/page.tsx 업데이트

**Files:**
- Modify: `components/home/KanbanBoard.tsx`
- Modify: `app/(app)/home/page.tsx`

TDD 면제.

- [ ] **Step 1: KanbanBoard.tsx 상단에 Skeleton import 추가**

기존 import 블록 끝에 추가:
```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

- [ ] **Step 2: KanbanBoard.tsx 파일 끝에 Skeleton 정적 프로퍼티 추가**

`KanbanBoard` 함수 선언 닫힘 `}` 뒤에 추가:

```tsx
KanbanBoard.Skeleton = function KanbanBoardSkeleton() {
  return (
    <div className="flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto lg:overflow-x-visible snap-x snap-mandatory pb-4">
      {Array.from({ length: 6 }).map((_, col) => (
        <div
          key={col}
          className="w-72 lg:w-auto flex-shrink-0 flex flex-col gap-2 p-3 min-h-[400px] rounded-[var(--md-sys-shape-medium)] bg-[var(--md-sys-color-surface-container-low)]"
        >
          <div className="flex items-center gap-2 px-1 py-2 mb-1">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-4 ml-auto" />
          </div>
          {Array.from({ length: 2 }).map((_, card) => (
            <div
              key={card}
              className="rounded-[var(--md-sys-shape-medium)] bg-[var(--md-sys-color-surface)] p-3 space-y-2 border border-[var(--md-sys-color-outline-variant)]"
            >
              <Skeleton className="h-2 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="flex items-center justify-between pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-2 w-16" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: home/page.tsx 전체 교체**

```tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BuyerHome } from '@/components/home/BuyerHome';
import { PgHome } from '@/components/home/PgHome';
import { PgRfpBlockedToast } from '@/components/home/PgRfpBlockedToast';
import { KanbanBoard } from '@/components/home/KanbanBoard';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/home');

  const { notice } = await searchParams;

  if (session.user.workspaceType === 'pg' && session.user.workspaceId) {
    return (
      <>
        {notice === 'pg-rfp-blocked' && <PgRfpBlockedToast />}
        <Suspense
          fallback={
            <div className="px-8 py-10">
              <KanbanBoard.Skeleton />
            </div>
          }
        >
          <PgHome workspaceId={session.user.workspaceId} />
        </Suspense>
      </>
    );
  }

  if (session.user.workspaceType === 'buyer' && session.user.workspaceId) {
    return (
      <Suspense
        fallback={
          <div className="px-8 py-10">
            <KanbanBoard.Skeleton />
          </div>
        }
      >
        <BuyerHome workspaceId={session.user.workspaceId} />
      </Suspense>
    );
  }

  redirect('/login');
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add components/home/KanbanBoard.tsx "app/(app)/home/page.tsx"
git commit -m "feat(home): KanbanBoard.Skeleton 추가 및 home/page 컴포넌트 레벨 Suspense 적용"
```

---

## Task 6: RfpDetailContent.Skeleton + rfp/[id]/page.tsx 업데이트

**Files:**
- Modify: `components/rfp/RfpDetailContent.tsx`
- Modify: `app/(app)/rfp/[id]/page.tsx`

TDD 면제.

- [ ] **Step 1: RfpDetailContent.tsx 상단에 Skeleton import 추가**

기존 import 블록 끝에 추가:
```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

- [ ] **Step 2: RfpDetailContent.tsx 파일 끝에 Skeleton 정적 프로퍼티 추가**

`RfpDetailContent` 함수 닫힘 `}` 뒤에 추가:

```tsx
RfpDetailContent.Skeleton = function RfpDetailContentSkeleton() {
  return (
    <>
      {/* Header */}
      <div>
        <Skeleton className="h-3 w-28" />
        <div className="flex items-start justify-between mt-1 gap-4">
          <Skeleton className="h-8 w-80" />
          <div className="flex items-center gap-3 shrink-0">
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* 제안 비교 section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-2 w-12" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
              {Array.from({ length: 5 }).map((_, i) => (
                <th key={i} className="px-3 py-3 text-left">
                  <Skeleton className="h-2 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--md-sys-color-outline-variant)]">
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-3 py-4">
                    <Skeleton className="h-3 w-20" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-10 border-t border-[var(--md-sys-color-outline-variant)] pt-8">
        <section>
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-2 w-16" />
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="py-2 flex items-baseline justify-between">
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-2 w-16" />
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-[var(--md-sys-shape-small)]" />
            ))}
          </div>
        </section>
      </div>
    </>
  );
};
```

- [ ] **Step 3: rfp/[id]/page.tsx 전체 교체**

```tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { PageEnter } from '@/components/primitives/PageEnter';
import { RfpDetailContent } from '@/components/rfp/RfpDetailContent';
import { auth } from '@/auth';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RfpDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect(`/login?next=/rfp/${id}`);
  }

  return (
    <Suspense
      fallback={
        <div className="px-8 py-8 space-y-10">
          <RfpDetailContent.Skeleton />
        </div>
      }
    >
      <RfpDetailLoader
        code={id}
        workspaceId={session.user.workspaceId}
        userId={session.user.id}
        userName={session.user.name ?? session.user.email ?? '구매사 담당자'}
      />
    </Suspense>
  );
}

async function RfpDetailLoader({
  code,
  workspaceId,
  userId,
  userName,
}: {
  code: string;
  workspaceId: string;
  userId: string;
  userName: string;
}) {
  const data = await loadBuyerRfpDetail({ code, workspaceId, userId, userName });
  if (!data) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          RFP를 찾을 수 없습니다.
        </p>
      </div>
    );
  }
  return (
    <PageEnter className="px-8 py-8 space-y-10">
      <RfpDetailContent data={data} />
    </PageEnter>
  );
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/RfpDetailContent.tsx "app/(app)/rfp/[id]/page.tsx"
git commit -m "feat(rfp): RfpDetailContent.Skeleton 추가 및 rfp/[id]/page 컴포넌트 레벨 Suspense 적용"
```

---

## Task 7: PgRfpDetailContent.Skeleton + inbox/[rfpId]/page.tsx 업데이트

**Files:**
- Modify: `components/inbox/PgRfpDetailContent.tsx`
- Modify: `app/(app)/inbox/[rfpId]/page.tsx`

TDD 면제.

- [ ] **Step 1: PgRfpDetailContent.tsx 상단에 Skeleton import 추가**

기존 import 블록 끝에 추가:
```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

- [ ] **Step 2: PgRfpDetailContent.tsx 파일 끝에 Skeleton 정적 프로퍼티 추가**

`PgRfpDetailContent` 함수 닫힘 `}` 뒤에 추가:

```tsx
PgRfpDetailContent.Skeleton = function PgRfpDetailContentSkeleton() {
  return (
    <div className="grid grid-cols-[340px_1fr] gap-12">
      {/* Left: brief panel (340px) */}
      <div className="border-r border-[var(--md-sys-color-outline-variant)] pr-10 space-y-6">
        <div>
          <Skeleton className="h-2 w-24 mb-2" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-2 flex items-baseline justify-between">
              <Skeleton className="h-2 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
      {/* Right: bid form */}
      <div>
        <div className="mb-8">
          <Skeleton className="h-2 w-20 mb-2" />
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] p-6 space-y-4"
            >
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 w-full rounded-[var(--md-sys-shape-small)]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: inbox/[rfpId]/page.tsx 전체 교체**

```tsx
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { PgRfpDetailContent } from '@/components/inbox/PgRfpDetailContent';

type Props = { params: Promise<{ rfpId: string }> };

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: Props) {
  const { rfpId: rfpCode } = await params;

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}`);
  }

  const workspaceId = session.user.workspaceId;

  return (
    <div className="px-8 py-8">
      <Suspense fallback={<PgRfpDetailContent.Skeleton />}>
        <PgRfpDetailLoader code={rfpCode} workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}

async function PgRfpDetailLoader({
  code,
  workspaceId,
}: {
  code: string;
  workspaceId: string;
}) {
  const data = await loadPgRfpDetail({ code, workspaceId });
  if (!data) notFound();
  return <PgRfpDetailContent data={data} mode="page" />;
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/PgRfpDetailContent.tsx "app/(app)/inbox/[rfpId]/page.tsx"
git commit -m "feat(inbox): PgRfpDetailContent.Skeleton 추가 및 inbox/[rfpId]/page 컴포넌트 레벨 Suspense 적용"
```

---

## Task 8: components/skeletons/ 및 __tests__/skeletons/ 삭제

**Files:**
- Delete: `components/skeletons/` 디렉토리 전체
- Delete: `__tests__/skeletons/` 디렉토리 전체 (존재할 경우)

이 시점에서 `components/skeletons/`를 참조하는 파일은 없어야 한다 (Task 2에서 loading.tsx가 교체됨).

- [ ] **Step 1: 삭제 전 참조 확인**

```bash
grep -r "components/skeletons" app/ components/ --include="*.tsx" --include="*.ts"
```

Expected: 출력 없음 (참조 파일 없음). 출력이 있다면 해당 파일을 먼저 수정.

- [ ] **Step 2: skeletons 디렉토리 삭제**

```bash
rm -rf components/skeletons
```

- [ ] **Step 3: __tests__/skeletons 디렉토리 삭제 (존재하는 경우)**

```bash
ls __tests__/skeletons 2>/dev/null && rm -rf __tests__/skeletons || echo "없음"
```

- [ ] **Step 4: 테스트 실행**

```bash
pnpm test
```

Expected: 전체 통과. 실패하는 테스트가 있다면 skeletons 관련 import가 남아 있는 것 — Step 1 grep 결과 재확인.

- [ ] **Step 5: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor: components/skeletons 디렉토리 삭제 — 컴포넌트 공존 skeleton으로 대체"
```

---

## Task 9: 최종 검증

- [ ] **Step 1: 전체 테스트**

```bash
pnpm test
```

Expected: 전체 통과.

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 린트**

```bash
./node_modules/.bin/eslint . --ext .ts,.tsx
```

Expected: 에러 없음.

- [ ] **Step 4: 개발 서버 실행 + CLS 수동 확인**

```bash
pnpm dev
```

Chrome DevTools → Network 탭 → "Slow 3G" 선택 후 각 페이지 방문:
- `/rfp` — 헤더(제목+버튼) 즉시 표시, 테이블 스켈레톤 → 실제 데이터 (레이아웃 이동 없음)
- `/inbox` — 스켈레톤 헤더+테이블 → 실제 데이터 (레이아웃 이동 없음)
- `/home` — 칸반 스켈레톤 → 실제 칸반 (레이아웃 이동 없음)
- `/rfp/[id]` — 전체 스켈레톤 → 실제 상세 (레이아웃 이동 없음)
- `/inbox/[rfpId]` — 그리드 스켈레톤 → 실제 폼 (레이아웃 이동 없음)
- 새로 고침 시 각 페이지 "LOADING…" 표시 확인 (route-level)

Performance 탭 → CLS 값 ≈ 0 확인.
