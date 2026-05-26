# Admin Console — Phase 2: Admin UI 화면

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**전제조건:** `2026-05-27-admin-phase1-foundation.md` 완료 후 진행.

**Goal:** 어드민 콘솔 전체 UI 구현 — 로그인, 대시보드, 입점 심사, 구매사/판매사 관리, RFP 관리, 감사 로그.

**Architecture:** `app/(admin)/` 라우트 그룹에 독립 레이아웃(AdminShell). 모든 데이터 조회는 `lib/server/queries/admin/` 서버 함수. 모든 뮤테이션은 `lib/server/actions/admin/` 서버 액션. 모든 액션은 동일 트랜잭션 내 `admin_audit_logs` insert 포함.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Drizzle ORM, Tailwind v4 (Linear 디자인 시스템 동일 적용)

---

## 파일 맵

**신규 생성:**

Admin 레이아웃/인증:
- `app/(admin)/layout.tsx`
- `app/(admin)/login/page.tsx`
- `app/(admin)/login/actions.ts`
- `components/admin/AdminSidebar.tsx`
- `components/admin/AdminHeader.tsx`

Admin 쿼리 함수:
- `lib/server/queries/admin/dashboard.ts`
- `lib/server/queries/admin/review.ts`
- `lib/server/queries/admin/buyers.ts`
- `lib/server/queries/admin/sellers.ts`
- `lib/server/queries/admin/rfps.ts`
- `lib/server/queries/admin/audit-log.ts`

Admin 서버 액션:
- `lib/server/actions/admin/approveWorkspaceAction.ts`
- `lib/server/actions/admin/rejectWorkspaceAction.ts`
- `lib/server/actions/admin/suspendWorkspaceAction.ts`
- `lib/server/actions/admin/unsuspendWorkspaceAction.ts`
- `lib/server/actions/admin/createAdminNoteAction.ts`
- `lib/server/actions/admin/hideQuoteAction.ts`
- `lib/server/actions/admin/extendRfpDeadlineAction.ts`
- `lib/server/actions/admin/sendReminderAction.ts`

Admin 페이지:
- `app/(admin)/page.tsx` (대시보드)
- `app/(admin)/review/page.tsx`
- `app/(admin)/review/[id]/page.tsx`
- `app/(admin)/buyers/page.tsx`
- `app/(admin)/buyers/[id]/page.tsx`
- `app/(admin)/sellers/page.tsx`
- `app/(admin)/sellers/[id]/page.tsx`
- `app/(admin)/rfps/page.tsx`
- `app/(admin)/rfps/[id]/page.tsx`
- `app/(admin)/audit-log/page.tsx`

테스트:
- `lib/server/actions/admin/__tests__/workspace-actions.test.ts`
- `lib/server/queries/admin/__tests__/dashboard.test.ts`

---

## Task 9: Admin 로그인 — 레이아웃 + login 액션

**Files:**
- Create: `app/(admin)/layout.tsx`
- Create: `components/admin/AdminShell.tsx`
- Create: `app/(admin)/login/page.tsx`
- Create: `app/(admin)/login/actions.ts`

- [ ] **Step 1: login 서버 액션 테스트 작성 (RED)**

```typescript
// app/(admin)/login/__tests__/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));

beforeEach(() => {
  vi.stubEnv('ADMIN_ID', 'testadmin');
  vi.stubEnv('ADMIN_PASSWORD', 'testpass123');
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-secret-min-32-characters-long!!');
});

describe('loginAction', () => {
  it('올바른 자격증명 → 쿠키 세팅 후 /admin 리다이렉트', async () => {
    const setCookieMock = vi.fn();
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({ set: setCookieMock } as never);

    const { loginAction } = await import('../actions');
    await expect(loginAction({ adminId: 'testadmin', password: 'testpass123' }))
      .rejects.toThrow('REDIRECT:/admin');
    expect(setCookieMock).toHaveBeenCalledWith(
      expect.stringContaining('admin'),
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('잘못된 자격증명 → INVALID_CREDENTIALS 반환', async () => {
    const { loginAction } = await import('../actions');
    const result = await loginAction({ adminId: 'wrong', password: 'wrong' });
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test app/\(admin\)/login/__tests__/actions.test.ts
```

Expected: FAIL

- [ ] **Step 3: `app/(admin)/login/actions.ts` 구현**

```typescript
'use server';

import { z } from 'zod/v4';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  signAdminToken,
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_OPTIONS,
} from '@/lib/auth/admin-session';

const Input = z.object({
  adminId: z.string().min(1),
  password: z.string().min(1),
}).strict();

export type LoginResult = { ok: false; error: string } | { ok: true };

export async function loginAction(input: unknown): Promise<LoginResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const { adminId, password } = parsed.data;
  if (
    adminId !== process.env.ADMIN_ID ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }

  const token = await signAdminToken(adminId);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_OPTIONS);
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  redirect('/admin/login');
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test app/\(admin\)/login/__tests__/actions.test.ts
```

Expected: PASS

- [ ] **Step 5: AdminShell 컴포넌트 생성**

```typescript
// components/admin/AdminShell.tsx
import Link from 'next/link';
import { logoutAction } from '@/app/(admin)/login/actions';

const NAV = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/review', label: '입점 심사' },
  { href: '/admin/buyers', label: '구매사' },
  { href: '/admin/sellers', label: '판매사' },
  { href: '/admin/rfps', label: 'RFP' },
  { href: '/admin/audit-log', label: '감사 로그' },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 사이드바 */}
      <aside className="w-52 flex-shrink-0 border-r border-outline-variant bg-surface flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
          <div className="h-5 w-5 rounded bg-primary" />
          <span className="text-label-large font-semibold">BIDIT Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center px-4 py-2 text-body-medium text-on-surface hover:bg-surface-container-low"
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="p-3 border-t border-outline-variant">
          <button type="submit" className="w-full text-left px-3 py-2 text-body-small text-on-surface-variant hover:bg-surface-container-low rounded">
            로그아웃
          </button>
        </form>
      </aside>
      {/* 본문 */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Admin 레이아웃 생성**

```typescript
// app/(admin)/layout.tsx
import { requireAdminSession } from '@/lib/auth/admin-session';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession(); // 미인증 시 /admin/login 리다이렉트
  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 7: Login 페이지 생성**

```typescript
// app/(admin)/login/page.tsx
'use client';

import { useState, useTransition } from 'react';
import { loginAction } from './actions';

export default function AdminLoginPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await loginAction({
        adminId: fd.get('adminId') as string,
        password: fd.get('password') as string,
      });
      if (result && !result.ok) setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded border border-outline-variant bg-surface p-6">
        <h1 className="text-title-large font-semibold">Admin 로그인</h1>
        <div>
          <label className="text-label-medium">아이디</label>
          <input name="adminId" autoComplete="username" required
            className="mt-1 w-full rounded border border-outline px-3 py-2 text-body-medium bg-surface-container outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-label-medium">비밀번호</label>
          <input name="password" type="password" autoComplete="current-password" required
            className="mt-1 w-full rounded border border-outline px-3 py-2 text-body-medium bg-surface-container outline-none focus:border-primary" />
        </div>
        {error && <p className="text-body-small text-error">{error}</p>}
        <button type="submit" disabled={isPending}
          className="w-full rounded bg-primary px-4 py-2 text-label-large text-on-primary disabled:opacity-50">
          {isPending ? 'LOADING…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
```

> **Note:** login 레이아웃은 AdminShell을 렌더하지 않아야 함. `/admin/login` 은 `(admin)/layout.tsx`의 `requireAdminSession`을 호출하면 무한루프. layout.tsx에서 `/admin/login` 경로를 건너뛰거나, login 페이지를 `(admin)/` 밖에 둔다.
>
> **해결:** `app/(admin)/layout.tsx`에서 pathname 확인:
> ```typescript
> import { headers } from 'next/headers';
> 
> export default async function AdminLayout({ children }) {
>   const headersList = await headers();
>   const pathname = headersList.get('x-pathname') ?? '';
>   if (!pathname.startsWith('/admin/login')) {
>     await requireAdminSession();
>   }
>   // login 페이지는 AdminShell 없이 렌더
>   if (pathname === '/admin/login') return <>{children}</>;
>   return <AdminShell>{children}</AdminShell>;
> }
> ```
>
> 또는 더 간단하게 `app/(admin)/login/layout.tsx` 생성 (빈 레이아웃으로 부모 layout override):
> ```typescript
> // app/(admin)/login/layout.tsx
> export default function LoginLayout({ children }: { children: React.ReactNode }) {
>   return <>{children}</>;
> }
> ```
> 이 파일이 있으면 `/admin/login` 은 `(admin)/layout.tsx`의 requireAdminSession을 여전히 호출함 — Next.js layout은 중첩되므로 이 방법은 안 됨.
>
> **권장:** `app/(admin)/layout.tsx`에서 `requireAdminSession`을 건너뛰는 조건 추가 (위의 pathname 체크 방식).

- [ ] **Step 8: typecheck**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 9: 커밋**

```bash
git add app/\(admin\)/ components/admin/ lib/server/actions/admin/
git commit -m "feat(admin): 로그인 페이지 + AdminShell 레이아웃"
```

---

## Task 10: 대시보드 쿼리 + 페이지

**Files:**
- Create: `lib/server/queries/admin/dashboard.ts`
- Create: `lib/server/queries/admin/__tests__/dashboard.test.ts`
- Create: `app/(admin)/page.tsx`

- [ ] **Step 1: 대시보드 쿼리 테스트 작성 (RED)**

```typescript
// lib/server/queries/admin/__tests__/dashboard.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, rfps, verificationApplications } from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { getDashboardStats, getHotlist } from '../dashboard';
import { seedUser, seedBuyerWorkspace, seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });

describe('getDashboardStats', () => {
  it('대기 중 심사 수를 반환한다', async () => {
    // pending workspace 2개 생성
    await db.insert(workspaces).values({ type: 'buyer', name: 'B1' }); // status defaults to pending
    await db.insert(workspaces).values({ type: 'pg', name: 'P1' });
    const ws3 = await seedBuyerWorkspace(db); // active (seed는 active)

    const stats = await getDashboardStats(db);
    expect(stats.pendingReviewCount).toBe(2);
  });

  it('진행 중 RFP 수를 반환한다', async () => {
    const user = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    await db.insert(rfps).values({
      buyerWsId: ws.id,
      title: 'RFP1',
      status: 'sent',
      createdBy: user.id,
    });
    const stats = await getDashboardStats(db);
    expect(stats.activeRfpCount).toBeGreaterThanOrEqual(1);
  });
});

describe('getHotlist', () => {
  it('빈 DB에서 빈 배열 반환', async () => {
    const hotlist = await getHotlist(db);
    expect(Array.isArray(hotlist)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/server/queries/admin/__tests__/dashboard.test.ts
```

Expected: FAIL

- [ ] **Step 3: `lib/server/queries/admin/dashboard.ts` 구현**

```typescript
import { and, count, eq, lt, lte, sql } from 'drizzle-orm';
import {
  workspaces, verificationApplications, rfps,
  bids, riskFlags,
} from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = typeof actionDb | PgliteDB;

export async function getDashboardStats(db: DB = actionDb) {
  const [pending] = await db
    .select({ count: count() })
    .from(workspaces)
    .where(eq(workspaces.status, 'pending'));

  const [activeRfp] = await db
    .select({ count: count() })
    .from(rfps)
    .where(eq(rfps.status, 'sent'));

  const [slaOverdue] = await db
    .select({ count: count() })
    .from(verificationApplications)
    .where(
      and(
        eq(verificationApplications.status, 'submitted'),
        lt(
          verificationApplications.submittedAt,
          sql`now() - interval '24 hours'`,
        ),
      ),
    );

  return {
    pendingReviewCount: pending.count,
    activeRfpCount: activeRfp.count,
    slaOverdueCount: slaOverdue.count,
  };
}

export interface HotlistItem {
  type: 'sla_overdue' | 'low_response' | 'deadline_approaching' | 'quote_invalid';
  label: string;
  subLabel: string;
  entityId: string;
  href: string;
}

export async function getHotlist(db: DB = actionDb): Promise<HotlistItem[]> {
  const items: HotlistItem[] = [];

  // SLA 초과 심사 건
  const overdueApps = await db
    .select({
      id: verificationApplications.id,
      workspaceId: verificationApplications.workspaceId,
      submittedAt: verificationApplications.submittedAt,
    })
    .from(verificationApplications)
    .where(
      and(
        eq(verificationApplications.status, 'submitted'),
        lt(verificationApplications.submittedAt, sql`now() - interval '24 hours'`),
      ),
    )
    .limit(5);

  for (const app of overdueApps) {
    const [ws] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, app.workspaceId));
    const hoursOverdue = Math.floor(
      (Date.now() - new Date(app.submittedAt).getTime()) / 3600000 - 24,
    );
    items.push({
      type: 'sla_overdue',
      label: ws?.name ?? app.workspaceId,
      subLabel: `SLA +${hoursOverdue}시간`,
      entityId: app.id,
      href: `/admin/review/${app.id}`,
    });
  }

  // 마감 임박 RFP (48시간 이내)
  const urgentRfps = await db
    .select({ id: rfps.id, code: rfps.code, deadline: rfps.deadline })
    .from(rfps)
    .where(
      and(
        eq(rfps.status, 'sent'),
        lte(rfps.deadline, sql`now() + interval '48 hours'`),
      ),
    )
    .limit(5);

  for (const rfp of urgentRfps) {
    items.push({
      type: 'deadline_approaching',
      label: `RFP ${rfp.code}`,
      subLabel: '마감 임박',
      entityId: rfp.id,
      href: `/admin/rfps/${rfp.id}`,
    });
  }

  return items;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test lib/server/queries/admin/__tests__/dashboard.test.ts
```

Expected: PASS

- [ ] **Step 5: 대시보드 페이지 생성**

```typescript
// app/(admin)/page.tsx
import { getDashboardStats, getHotlist } from '@/lib/server/queries/admin/dashboard';

export default async function AdminDashboardPage() {
  const [stats, hotlist] = await Promise.all([getDashboardStats(), getHotlist()]);

  return (
    <div className="space-y-6">
      <h1 className="text-headline-small font-semibold">대시보드</h1>

      {/* 지표 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="심사 대기" value={stats.pendingReviewCount} href="/admin/review" />
        <StatCard label="SLA 초과" value={stats.slaOverdueCount} href="/admin/review?filter=sla" alert />
        <StatCard label="진행 중 RFP" value={stats.activeRfpCount} href="/admin/rfps" />
      </div>

      {/* 핫리스트 */}
      {hotlist.length > 0 && (
        <section>
          <h2 className="text-title-medium font-semibold mb-3">핫리스트</h2>
          <div className="rounded border border-outline-variant overflow-hidden">
            {hotlist.map((item) => (
              <a
                key={item.entityId}
                href={item.href}
                className="flex items-center justify-between px-4 py-3 border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <div>
                  <span className="text-body-medium">{item.label}</span>
                  <span className="ml-3 text-body-small text-on-surface-variant">{item.subLabel}</span>
                </div>
                <span className="text-label-small text-primary">→</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label, value, href, alert,
}: { label: string; value: number; href: string; alert?: boolean }) {
  return (
    <a href={href} className="block rounded border border-outline-variant bg-surface p-4 hover:bg-surface-container-low">
      <div className="text-body-small text-on-surface-variant">{label}</div>
      <div className={`mt-1 font-mono text-display-small font-bold ${alert && value > 0 ? 'text-error' : 'text-on-surface'}`}>
        {value}
      </div>
    </a>
  );
}
```

- [ ] **Step 6: 커밋**

```bash
git add lib/server/queries/admin/ app/\(admin\)/page.tsx
git commit -m "feat(admin): 대시보드 통계 쿼리 + 핫리스트 + 페이지"
```

---

## Task 11: 입점 심사 목록 + 심사 액션 (승인/반려/보완)

**Files:**
- Create: `lib/server/queries/admin/review.ts`
- Create: `lib/server/actions/admin/approveWorkspaceAction.ts`
- Create: `lib/server/actions/admin/rejectWorkspaceAction.ts`
- Create: `lib/server/actions/admin/requestMoreInfoAction.ts`
- Create: `lib/server/actions/admin/__tests__/workspace-actions.test.ts`
- Create: `app/(admin)/review/page.tsx`
- Create: `app/(admin)/review/[id]/page.tsx`

- [ ] **Step 1: 액션 테스트 작성 (RED)**

```typescript
// lib/server/actions/admin/__tests__/workspace-actions.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminSession: () => Promise.resolve({ adminId: 'admin' }),
}));
vi.mock('next/navigation', () => ({
  revalidatePath: vi.fn(),
}));

let db: PgliteDB;
let wsId: string;
let appId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  // pending workspace + verification_application 생성
  const [ws] = await db.insert(workspaces).values({ type: 'buyer', name: '심사대기구매사' }).returning();
  wsId = ws.id;
  const [app] = await db.insert(verificationApplications).values({
    workspaceId: ws.id, orgType: 'buyer',
  }).returning();
  appId = app.id;
});

describe('approveWorkspaceAction', () => {
  it('workspace.status를 active로 변경한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId);

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
    expect(ws.status).toBe('active');
    expect(ws.reviewedAt).not.toBeNull();
  });

  it('verification_application.status를 approved로 변경한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId);

    const [app] = await db.select().from(verificationApplications).where(eq(verificationApplications.id, appId));
    expect(app.status).toBe('approved');
    expect(app.reviewedBy).toBe('admin');
  });

  it('admin_audit_log에 workspace.approve 이벤트를 기록한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId);

    const logs = await db.select().from(adminAuditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('workspace.approve');
    expect(logs[0].entityId).toBe(wsId);
  });
});

describe('rejectWorkspaceAction', () => {
  it('reason 없이 호출 시 오류 반환', async () => {
    const { rejectWorkspaceAction } = await import('../rejectWorkspaceAction');
    const result = await rejectWorkspaceAction(db, wsId, '');
    expect(result).toEqual({ ok: false, error: 'REASON_REQUIRED' });
  });

  it('reason 있으면 workspace.status를 pending 유지하고 application을 rejected로', async () => {
    const { rejectWorkspaceAction } = await import('../rejectWorkspaceAction');
    await rejectWorkspaceAction(db, wsId, '서류 미비');

    const [app] = await db.select().from(verificationApplications).where(eq(verificationApplications.id, appId));
    expect(app.status).toBe('rejected');
    expect(app.reason).toBe('서류 미비');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/server/actions/admin/__tests__/workspace-actions.test.ts
```

Expected: FAIL

- [ ] **Step 3: `approveWorkspaceAction.ts` 구현**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaces, verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = typeof actionDb | PgliteDB;

export async function approveWorkspaceAction(db: DB = actionDb, workspaceId: string) {
  const session = await requireAdminSession();
  const now = new Date();

  await (db as typeof actionDb).transaction(async (tx) => {
    await tx
      .update(workspaces)
      .set({ status: 'active', reviewedAt: now })
      .where(eq(workspaces.id, workspaceId));

    await tx
      .update(verificationApplications)
      .set({ status: 'approved', reviewedBy: session.adminId, reviewedAt: now })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'active' } },
    });
  });

  revalidatePath('/admin/review');
  revalidatePath('/admin');
}
```

- [ ] **Step 4: `rejectWorkspaceAction.ts` 구현**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = typeof actionDb | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

export async function rejectWorkspaceAction(db: DB = actionDb, workspaceId: string, reason: string): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };

  const session = await requireAdminSession();
  const now = new Date();

  await (db as typeof actionDb).transaction(async (tx) => {
    await tx
      .update(verificationApplications)
      .set({ status: 'rejected', reviewedBy: session.adminId, reviewedAt: now, reason })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.reject',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { reason },
    });
  });

  revalidatePath('/admin/review');
  return { ok: true };
}
```

- [ ] **Step 5: `requestMoreInfoAction.ts` 구현**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function requestMoreInfoAction(workspaceId: string, reason: string): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };
  const session = await requireAdminSession();

  await actionDb.transaction(async (tx) => {
    await tx
      .update(verificationApplications)
      .set({ status: 'needs_more_info', reviewedBy: session.adminId, reason })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.needs_more_info',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { reason },
    });
  });

  revalidatePath('/admin/review');
  return { ok: true };
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm test lib/server/actions/admin/__tests__/workspace-actions.test.ts
```

Expected: PASS

- [ ] **Step 7: `lib/server/queries/admin/review.ts` 구현**

```typescript
import { desc, eq } from 'drizzle-orm';
import { workspaces, verificationApplications, pgProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function listPendingApplications() {
  return actionDb
    .select({
      applicationId: verificationApplications.id,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      orgType: verificationApplications.orgType,
      status: verificationApplications.status,
      submittedAt: verificationApplications.submittedAt,
      reviewedAt: verificationApplications.reviewedAt,
    })
    .from(verificationApplications)
    .innerJoin(workspaces, eq(verificationApplications.workspaceId, workspaces.id))
    .where(eq(verificationApplications.status, 'submitted'))
    .orderBy(desc(verificationApplications.submittedAt));
}

export async function getApplicationDetail(applicationId: string) {
  const [app] = await actionDb
    .select()
    .from(verificationApplications)
    .where(eq(verificationApplications.id, applicationId));
  if (!app) return null;

  const [ws] = await actionDb
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, app.workspaceId));

  const [profile] = await actionDb
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, app.workspaceId));

  return { application: app, workspace: ws, pgProfile: profile ?? null };
}
```

- [ ] **Step 8: 심사 목록 페이지 생성**

```typescript
// app/(admin)/review/page.tsx
import { listPendingApplications } from '@/lib/server/queries/admin/review';
import Link from 'next/link';

export default async function ReviewListPage() {
  const apps = await listPendingApplications();

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">입점 심사</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">유형</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">신청일</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.applicationId} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                <td className="px-4 py-3">
                  <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
                    {app.orgType === 'buyer' ? '구매사' : '판매사'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/review/${app.applicationId}`} className="text-primary hover:underline">
                    {app.workspaceName}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-on-surface-variant">
                  {new Date(app.submittedAt).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3">
                  <span className="text-label-small rounded bg-surface-container px-2 py-0.5">
                    {app.status}
                  </span>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">대기 중인 신청이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: 심사 상세 페이지 생성**

```typescript
// app/(admin)/review/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getApplicationDetail } from '@/lib/server/queries/admin/review';
import { approveWorkspaceAction } from '@/lib/server/actions/admin/approveWorkspaceAction';
import { rejectWorkspaceAction } from '@/lib/server/actions/admin/rejectWorkspaceAction';
import { requestMoreInfoAction } from '@/lib/server/actions/admin/requestMoreInfoAction';

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getApplicationDetail(id);
  if (!detail) notFound();

  const { application, workspace, pgProfile } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
          <p className="text-body-small text-on-surface-variant mt-1">
            {application.orgType === 'buyer' ? '구매사' : '판매사'} •
            신청 {new Date(application.submittedAt).toLocaleString('ko-KR')}
          </p>
        </div>
        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <form action={approveWorkspaceAction.bind(null, undefined, workspace.id)}>
            <button type="submit" className="rounded bg-tertiary-container px-4 py-2 text-label-medium text-on-tertiary-container">
              승인
            </button>
          </form>
          <RejectForm workspaceId={workspace.id} />
          <MoreInfoForm workspaceId={workspace.id} />
        </div>
      </div>

      {/* 사업자 정보 */}
      <section className="rounded border border-outline-variant p-4">
        <h2 className="text-title-small font-semibold mb-3">사업자 정보</h2>
        <dl className="grid grid-cols-2 gap-2 text-body-small">
          <dt className="text-on-surface-variant">워크스페이스 ID</dt>
          <dd className="font-mono">{workspace.id}</dd>
          <dt className="text-on-surface-variant">상태</dt>
          <dd>{workspace.status}</dd>
        </dl>
      </section>

      {/* PG 프로필 (판매사만) */}
      {pgProfile && (
        <section className="rounded border border-outline-variant p-4">
          <h2 className="text-title-small font-semibold mb-3">서비스 범위 (판매사)</h2>
          <dl className="grid grid-cols-2 gap-2 text-body-small">
            <dt className="text-on-surface-variant">사업자번호</dt>
            <dd className="font-mono">{pgProfile.bizNo ?? '—'}</dd>
            <dt className="text-on-surface-variant">결제수단</dt>
            <dd>{pgProfile.serviceScope?.paymentMethods?.join(', ') ?? '—'}</dd>
            <dt className="text-on-surface-variant">월 거래액</dt>
            <dd>{pgProfile.serviceScope?.volumeRange ?? '—'}</dd>
            <dt className="text-on-surface-variant">회신 SLA</dt>
            <dd>{pgProfile.slaDays ? `${pgProfile.slaDays}일` : '—'}</dd>
            {pgProfile.salesContact && (
              <>
                <dt className="text-on-surface-variant">담당 영업</dt>
                <dd>{pgProfile.salesContact.name} / {pgProfile.salesContact.email}</dd>
              </>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}

function RejectForm({ workspaceId }: { workspaceId: string }) {
  return (
    <form className="flex gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input
        name="reason"
        placeholder="반려 사유"
        required
        className="rounded border border-outline px-2 py-1 text-body-small"
      />
      <button
        type="submit"
        formAction={async (fd: FormData) => {
          'use server';
          await rejectWorkspaceAction(undefined, workspaceId, fd.get('reason') as string);
        }}
        className="rounded bg-error-container px-3 py-1 text-label-medium text-on-error-container"
      >
        반려
      </button>
    </form>
  );
}

function MoreInfoForm({ workspaceId }: { workspaceId: string }) {
  return (
    <form className="flex gap-2">
      <input name="reason" placeholder="보완 요청 내용" required
        className="rounded border border-outline px-2 py-1 text-body-small" />
      <button
        type="submit"
        formAction={async (fd: FormData) => {
          'use server';
          await requestMoreInfoAction(workspaceId, fd.get('reason') as string);
        }}
        className="rounded bg-surface-container px-3 py-1 text-label-medium"
      >
        보완 요청
      </button>
    </form>
  );
}
```

- [ ] **Step 10: typecheck + 테스트**

```bash
pnpm tsc --noEmit && pnpm test lib/server/actions/admin/__tests__/workspace-actions.test.ts
```

- [ ] **Step 11: 커밋**

```bash
git add lib/server/queries/admin/review.ts lib/server/actions/admin/ app/\(admin\)/review/
git commit -m "feat(admin): 입점 심사 목록/상세 + 승인/반려/보완 액션"
```

---

## Task 12: 정지/해제 액션 + 운영 메모

**Files:**
- Create: `lib/server/actions/admin/suspendWorkspaceAction.ts`
- Create: `lib/server/actions/admin/unsuspendWorkspaceAction.ts`
- Create: `lib/server/actions/admin/createAdminNoteAction.ts`

- [ ] **Step 1: suspendWorkspaceAction 테스트 작성 (RED)**

```typescript
// lib/server/actions/admin/__tests__/workspace-actions.test.ts 에 describe 추가

describe('suspendWorkspaceAction', () => {
  it('reason 없으면 REASON_REQUIRED 반환', async () => {
    const { suspendWorkspaceAction } = await import('../suspendWorkspaceAction');
    const result = await suspendWorkspaceAction(db, wsId, '');
    expect(result).toEqual({ ok: false, error: 'REASON_REQUIRED' });
  });

  it('workspace.status를 suspended로 변경하고 audit log 기록', async () => {
    // 먼저 active로 만들어야 정지 가능
    await db.update(workspaces).set({ status: 'active' }).where(eq(workspaces.id, wsId));
    const { suspendWorkspaceAction } = await import('../suspendWorkspaceAction');
    await suspendWorkspaceAction(db, wsId, '약관 위반');

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
    expect(ws.status).toBe('suspended');
    expect(ws.statusReason).toBe('약관 위반');

    const logs = await db.select().from(adminAuditLogs);
    expect(logs.some(l => l.action === 'workspace.suspend')).toBe(true);
  });
});
```

- [ ] **Step 2: `suspendWorkspaceAction.ts` 구현**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaces, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = typeof actionDb | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

export async function suspendWorkspaceAction(db: DB = actionDb, workspaceId: string, reason: string): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };
  const session = await requireAdminSession();

  await (db as typeof actionDb).transaction(async (tx) => {
    await tx
      .update(workspaces)
      .set({ status: 'suspended', statusReason: reason, reviewedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.suspend',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'suspended' }, reason },
    });
  });

  revalidatePath('/admin');
  return { ok: true };
}
```

- [ ] **Step 3: `unsuspendWorkspaceAction.ts` 구현**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaces, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function unsuspendWorkspaceAction(workspaceId: string): Promise<void> {
  const session = await requireAdminSession();

  await actionDb.transaction(async (tx) => {
    await tx
      .update(workspaces)
      .set({ status: 'active', statusReason: null, reviewedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.unsuspend',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'active' } },
    });
  });

  revalidatePath('/admin');
}
```

- [ ] **Step 4: `createAdminNoteAction.ts` 구현**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminNotes, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function createAdminNoteAction(
  entityType: string,
  entityId: string,
  body: string,
  revalidate?: string,
): Promise<Result> {
  if (!body?.trim()) return { ok: false, error: 'BODY_REQUIRED' };
  const session = await requireAdminSession();

  await actionDb.transaction(async (tx) => {
    await tx.insert(adminNotes).values({
      entityType,
      entityId,
      body: body.trim(),
      createdBy: session.adminId,
    });
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'note.create',
      entityType,
      entityId,
      payloadJson: { after: { body: body.trim() } },
    });
  });

  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm test lib/server/actions/admin/__tests__/workspace-actions.test.ts
```

- [ ] **Step 6: 커밋**

```bash
git add lib/server/actions/admin/
git commit -m "feat(admin): 정지/해제/메모 서버 액션"
```

---

## Task 13: 구매사 목록 + 상세 페이지

**Files:**
- Create: `lib/server/queries/admin/buyers.ts`
- Create: `app/(admin)/buyers/page.tsx`
- Create: `app/(admin)/buyers/[id]/page.tsx`

- [ ] **Step 1: `lib/server/queries/admin/buyers.ts` 구현**

```typescript
import { desc, eq } from 'drizzle-orm';
import { workspaces, rfps, bids } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function listBuyers() {
  return actionDb
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(eq(workspaces.type, 'buyer'))
    .orderBy(desc(workspaces.createdAt));
}

export async function getBuyerDetail(workspaceId: string) {
  const [ws] = await actionDb
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) return null;

  const buyerRfps = await actionDb
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      sentAt: rfps.sentAt,
    })
    .from(rfps)
    .where(eq(rfps.buyerWsId, workspaceId))
    .orderBy(desc(rfps.createdAt));

  return { workspace: ws, rfps: buyerRfps };
}
```

- [ ] **Step 2: 구매사 목록 페이지**

```typescript
// app/(admin)/buyers/page.tsx
import { listBuyers } from '@/lib/server/queries/admin/buyers';
import Link from 'next/link';

export default async function BuyersPage() {
  const buyers = await listBuyers();
  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">구매사</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => (
              <tr key={b.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                <td className="px-4 py-3">
                  <Link href={`/admin/buyers/${b.id}`} className="text-primary hover:underline">{b.name}</Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-label-small rounded px-2 py-0.5 ${
                    b.status === 'active' ? 'bg-tertiary-container text-on-tertiary-container' :
                    b.status === 'suspended' ? 'bg-error-container text-on-error-container' :
                    'bg-surface-container text-on-surface-variant'
                  }`}>{b.status}</span>
                </td>
                <td className="px-4 py-3 font-mono text-on-surface-variant text-label-small">
                  {new Date(b.createdAt).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 구매사 상세 페이지**

```typescript
// app/(admin)/buyers/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getBuyerDetail } from '@/lib/server/queries/admin/buyers';
import Link from 'next/link';

export default async function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getBuyerDetail(id);
  if (!detail) notFound();

  const { workspace, rfps } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <span className={`text-label-small rounded px-2 py-1 ${workspace.status === 'active' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container text-on-surface-variant'}`}>
          {workspace.status}
        </span>
      </div>

      {/* RFP 현황 */}
      <section>
        <h2 className="text-title-small font-semibold mb-3">RFP 현황 ({rfps.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">코드</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제목</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">마감</th>
              </tr>
            </thead>
            <tbody>
              {rfps.map((rfp) => (
                <tr key={rfp.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                  <td className="px-4 py-3 font-mono text-label-small">{rfp.code}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/rfps/${rfp.id}`} className="text-primary hover:underline">{rfp.title}</Link>
                  </td>
                  <td className="px-4 py-3">{rfp.status}</td>
                  <td className="px-4 py-3 font-mono text-label-small text-on-surface-variant">
                    {rfp.deadline ? new Date(rfp.deadline).toLocaleDateString('ko-KR') : '—'}
                  </td>
                </tr>
              ))}
              {rfps.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-on-surface-variant">RFP 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 커밋**

```bash
git add lib/server/queries/admin/buyers.ts app/\(admin\)/buyers/
git commit -m "feat(admin): 구매사 목록/상세 페이지"
```

---

## Task 14: 판매사 목록 + 상세 페이지

**Files:**
- Create: `lib/server/queries/admin/sellers.ts`
- Create: `app/(admin)/sellers/page.tsx`
- Create: `app/(admin)/sellers/[id]/page.tsx`

- [ ] **Step 1: `lib/server/queries/admin/sellers.ts`**

```typescript
import { desc, eq, count, sql } from 'drizzle-orm';
import { workspaces, bids, pgProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function listSellers() {
  return actionDb
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(eq(workspaces.type, 'pg'))
    .orderBy(desc(workspaces.createdAt));
}

export async function getSellerDetail(workspaceId: string) {
  const [ws] = await actionDb
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) return null;

  const [profile] = await actionDb
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, workspaceId));

  const sellerBids = await actionDb
    .select({
      id: bids.id,
      rfpId: bids.rfpId,
      status: bids.status,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .where(eq(bids.pgWsId, workspaceId))
    .orderBy(desc(bids.submittedAt))
    .limit(20);

  return { workspace: ws, pgProfile: profile ?? null, bids: sellerBids };
}
```

- [ ] **Step 2: 판매사 목록 페이지**

```typescript
// app/(admin)/sellers/page.tsx
import { listSellers } from '@/lib/server/queries/admin/sellers';
import Link from 'next/link';

export default async function SellersPage() {
  const sellers = await listSellers();
  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">판매사</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">회사명</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => (
              <tr key={s.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                <td className="px-4 py-3">
                  <Link href={`/admin/sellers/${s.id}`} className="text-primary hover:underline">{s.name}</Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-label-small rounded px-2 py-0.5 ${
                    s.status === 'active' ? 'bg-tertiary-container text-on-tertiary-container' :
                    s.status === 'suspended' ? 'bg-error-container text-on-error-container' :
                    'bg-surface-container text-on-surface-variant'
                  }`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 font-mono text-label-small text-on-surface-variant">
                  {new Date(s.createdAt).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 판매사 상세 페이지 (구조만, 핵심 정보 표시)**

```typescript
// app/(admin)/sellers/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getSellerDetail } from '@/lib/server/queries/admin/sellers';

export default async function SellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSellerDetail(id);
  if (!detail) notFound();
  const { workspace, pgProfile, bids } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-headline-small font-semibold">{workspace.name}</h1>

      {pgProfile && (
        <section className="rounded border border-outline-variant p-4">
          <h2 className="text-title-small font-semibold mb-3">서비스 범위</h2>
          <dl className="grid grid-cols-2 gap-2 text-body-small">
            <dt className="text-on-surface-variant">결제수단</dt>
            <dd>{pgProfile.serviceScope?.paymentMethods?.join(', ') ?? '—'}</dd>
            <dt className="text-on-surface-variant">월 거래액</dt>
            <dd>{pgProfile.serviceScope?.volumeRange ?? '—'}</dd>
            <dt className="text-on-surface-variant">담당 영업</dt>
            <dd>{pgProfile.salesContact?.name ?? '—'} / {pgProfile.salesContact?.email ?? '—'}</dd>
            <dt className="text-on-surface-variant">SLA</dt>
            <dd>{pgProfile.slaDays ? `${pgProfile.slaDays}일` : '—'}</dd>
          </dl>
        </section>
      )}

      <section>
        <h2 className="text-title-small font-semibold mb-3">최근 견적 ({bids.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">RFP ID</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제출일</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr key={bid.id} className="border-b border-outline-variant last:border-0">
                  <td className="px-4 py-3 font-mono text-label-small">{bid.rfpId.slice(0, 8)}…</td>
                  <td className="px-4 py-3">{bid.status}</td>
                  <td className="px-4 py-3 font-mono text-label-small text-on-surface-variant">
                    {bid.submittedAt ? new Date(bid.submittedAt).toLocaleDateString('ko-KR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 커밋**

```bash
git add lib/server/queries/admin/sellers.ts app/\(admin\)/sellers/
git commit -m "feat(admin): 판매사 목록/상세 페이지"
```

---

## Task 15: RFP 목록/상세 + 운영 액션 + 감사 로그 페이지

**Files:**
- Create: `lib/server/queries/admin/rfps.ts`
- Create: `lib/server/queries/admin/audit-log.ts`
- Create: `lib/server/actions/admin/extendRfpDeadlineAction.ts`
- Create: `lib/server/actions/admin/sendReminderAction.ts`
- Create: `lib/server/actions/admin/hideQuoteAction.ts`
- Create: `app/(admin)/rfps/page.tsx`
- Create: `app/(admin)/rfps/[id]/page.tsx`
- Create: `app/(admin)/audit-log/page.tsx`

- [ ] **Step 1: `extendRfpDeadlineAction.ts` 구현**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { rfps, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function extendRfpDeadlineAction(rfpId: string, days = 7): Promise<Result> {
  if (days < 1 || days > 30) return { ok: false, error: 'INVALID_DAYS' };
  const session = await requireAdminSession();

  const [rfp] = await actionDb.select({ deadline: rfps.deadline }).from(rfps).where(eq(rfps.id, rfpId));
  if (!rfp) return { ok: false, error: 'NOT_FOUND' };

  const oldDeadline = rfp.deadline;
  const newDeadline = new Date((oldDeadline ? new Date(oldDeadline) : new Date()).getTime() + days * 86400000);

  await actionDb.transaction(async (tx) => {
    await tx.update(rfps).set({ deadline: newDeadline }).where(eq(rfps.id, rfpId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'rfp.extend',
      entityType: 'rfp',
      entityId: rfpId,
      payloadJson: { before: { deadline: oldDeadline }, after: { deadline: newDeadline }, reason: `+${days}일 연장` },
    });
  });

  revalidatePath(`/admin/rfps/${rfpId}`);
  return { ok: true };
}
```

- [ ] **Step 2: `hideQuoteAction.ts` 구현**

```typescript
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { bids, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

type Result = { ok: true } | { ok: false; error: string };

export async function hideQuoteAction(bidId: string, reason: string): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };
  const session = await requireAdminSession();

  await actionDb.transaction(async (tx) => {
    await tx.update(bids).set({ status: 'withdrawn' }).where(eq(bids.id, bidId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'bid.hide',
      entityType: 'bid',
      entityId: bidId,
      payloadJson: { after: { status: 'withdrawn' }, reason },
    });
  });

  revalidatePath('/admin/rfps');
  return { ok: true };
}
```

- [ ] **Step 3: `sendReminderAction.ts` 구현**

```typescript
'use server';

import { inArray, eq } from 'drizzle-orm';
import { rfpInvitations, adminAuditLogs, outboxEntries } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { randomUUID } from 'node:crypto';

type Result = { ok: true; sent: number } | { ok: false; error: string };

export async function sendReminderAction(rfpId: string, pgWsIds: string[]): Promise<Result> {
  if (!pgWsIds.length) return { ok: false, error: 'NO_TARGETS' };
  const session = await requireAdminSession();

  // rfp_invitations에서 해당 PG의 초대 토큰과 이메일 조회
  const invitations = await actionDb
    .select()
    .from(rfpInvitations)
    .where(inArray(rfpInvitations.pgWsId, pgWsIds));

  let sent = 0;
  await actionDb.transaction(async (tx) => {
    for (const inv of invitations) {
      // outbox 패턴으로 리마인더 이메일 enqueue
      // 실제 이메일 주소는 workspace → members 에서 가져와야 하나, MVP에서는 outbox에 rfpId 기록
      await tx.insert(outboxEntries).values({
        id: randomUUID(),
        event: 'rfp.invited',
        toAddr: `reminder-${inv.pgWsId}@internal`, // 실제 구현 시 담당자 이메일로 변경
        subject: '견적 제출 리마인더',
        html: `RFP 마감이 임박했습니다.`,
        dedupeKey: `reminder-${rfpId}-${inv.pgWsId}-${Date.now()}`,
        status: 'pending',
        scheduledAt: new Date(),
      });
      sent++;
    }
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'reminder.send',
      entityType: 'rfp',
      entityId: rfpId,
      payloadJson: { after: { targetCount: sent, pgWsIds } },
    });
  });

  return { ok: true, sent };
}
```

- [ ] **Step 4: `lib/server/queries/admin/rfps.ts` 구현**

```typescript
import { desc, eq, count } from 'drizzle-orm';
import { rfps, workspaces, bids, rfpInvitations } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function listAllRfps() {
  return actionDb
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      buyerName: workspaces.name,
    })
    .from(rfps)
    .innerJoin(workspaces, eq(rfps.buyerWsId, workspaces.id))
    .orderBy(desc(rfps.createdAt));
}

export async function getRfpDetail(rfpId: string) {
  const [rfp] = await actionDb
    .select()
    .from(rfps)
    .where(eq(rfps.id, rfpId));
  if (!rfp) return null;

  const rfpBids = await actionDb
    .select({
      id: bids.id,
      pgWsId: bids.pgWsId,
      status: bids.status,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .where(eq(bids.rfpId, rfpId));

  const invitations = await actionDb
    .select({
      id: rfpInvitations.id,
      pgWsId: rfpInvitations.pgWsId,
      status: rfpInvitations.status,
    })
    .from(rfpInvitations)
    .where(eq(rfpInvitations.rfpId, rfpId));

  return { rfp, bids: rfpBids, invitations };
}
```

- [ ] **Step 5: RFP 목록/상세 페이지 생성**

```typescript
// app/(admin)/rfps/page.tsx
import { listAllRfps } from '@/lib/server/queries/admin/rfps';
import Link from 'next/link';

export default async function RfpsPage() {
  const rfpList = await listAllRfps();
  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">RFP 목록</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">코드</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제목</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">구매사</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">마감</th>
            </tr>
          </thead>
          <tbody>
            {rfpList.map((rfp) => (
              <tr key={rfp.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                <td className="px-4 py-3 font-mono text-label-small">{rfp.code}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/rfps/${rfp.id}`} className="text-primary hover:underline">{rfp.title}</Link>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{rfp.buyerName}</td>
                <td className="px-4 py-3">{rfp.status}</td>
                <td className="px-4 py-3 font-mono text-label-small text-on-surface-variant">
                  {rfp.deadline ? new Date(rfp.deadline).toLocaleDateString('ko-KR') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

```typescript
// app/(admin)/rfps/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getRfpDetail } from '@/lib/server/queries/admin/rfps';
import { extendRfpDeadlineAction } from '@/lib/server/actions/admin/extendRfpDeadlineAction';

export default async function RfpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getRfpDetail(id);
  if (!detail) notFound();
  const { rfp, bids, invitations } = detail;

  const pendingPgWsIds = invitations
    .filter((inv) => !bids.some((b) => b.pgWsId === inv.pgWsId && b.status === 'submitted'))
    .map((inv) => inv.pgWsId);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-headline-small font-semibold">{rfp.title}</h1>
          <p className="text-body-small text-on-surface-variant mt-1">{rfp.code} • {rfp.status}</p>
        </div>
        <div className="flex gap-2">
          <form action={extendRfpDeadlineAction.bind(null, rfp.id, 7)}>
            <button type="submit" className="rounded bg-surface-container px-3 py-1.5 text-label-medium hover:bg-surface-container-high">
              +7일 연장
            </button>
          </form>
        </div>
      </div>

      <section>
        <h2 className="text-title-small font-semibold mb-3">견적 현황</h2>
        <p className="text-body-small text-on-surface-variant">
          전달 {invitations.length}건 · 제출 {bids.filter(b => b.status === 'submitted').length}건 · 미회신 {pendingPgWsIds.length}건
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: 감사 로그 쿼리 + 페이지**

```typescript
// lib/server/queries/admin/audit-log.ts
import { desc } from 'drizzle-orm';
import { adminAuditLogs } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export async function listAuditLogs(limit = 100) {
  return actionDb
    .select()
    .from(adminAuditLogs)
    .orderBy(desc(adminAuditLogs.occurredAt))
    .limit(limit);
}
```

```typescript
// app/(admin)/audit-log/page.tsx
import { listAuditLogs } from '@/lib/server/queries/admin/audit-log';

export default async function AuditLogPage() {
  const logs = await listAuditLogs();
  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">감사 로그</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">시각</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">액션</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">대상</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">Actor</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-outline-variant last:border-0">
                <td className="px-4 py-2 font-mono text-label-small text-on-surface-variant">
                  {new Date(log.occurredAt).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-2 font-mono text-label-small">{log.action}</td>
                <td className="px-4 py-2 font-mono text-label-small text-on-surface-variant">
                  {log.entityType}/{log.entityId.slice(0, 8)}…
                </td>
                <td className="px-4 py-2 text-label-small">{log.actor}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">로그 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 전체 typecheck + 테스트**

```bash
pnpm tsc --noEmit && pnpm test
```

Expected: 모두 통과

- [ ] **Step 8: 최종 커밋**

```bash
git add lib/server/queries/admin/ lib/server/actions/admin/ app/\(admin\)/rfps/ app/\(admin\)/audit-log/
git commit -m "feat(admin): RFP 목록/상세 + 운영 액션 + 감사 로그 페이지 — Phase 2 완료"
```

---

## Phase 2 검증 체크리스트

- [ ] `pnpm tsc --noEmit` 통과
- [ ] `pnpm test` 전체 통과
- [ ] `pnpm dev` 실행 후 브라우저에서:
  - [ ] `http://localhost:3000/admin/login` → 로그인 폼 렌더
  - [ ] 올바른 env 자격증명 입력 → `/admin` 대시보드 이동
  - [ ] 잘못된 자격증명 → 에러 메시지 표시
  - [ ] `/admin/review` → 심사 목록 (empty state 확인)
  - [ ] `/admin/buyers`, `/admin/sellers`, `/admin/rfps` → 목록 렌더
  - [ ] `/admin/audit-log` → 감사 로그 렌더
  - [ ] 쿠키 없이 `/admin` 직접 진입 → `/admin/login` 리다이렉트
- [ ] `.env.local`에 `ADMIN_ID`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (32자 이상) 추가됨 확인
