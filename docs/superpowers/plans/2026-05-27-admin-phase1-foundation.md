# Admin Console — Phase 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DB 스키마 확장 + 어드민 JWT 인증 + 가입 게이트(workspace.status) + PG 회원가입 사업자 단계 추가. Phase 2(Admin UI)의 전제조건.

**Architecture:** 기존 `lib/db/schema/`에 admin 전용 테이블 5개 추가 + `workspaces.status` 컬럼 추가. 어드민 인증은 `jose` SignJWT(`admin-token` httpOnly 쿠키), `proxy.ts`에서 edge-compatible jwtVerify. `(app)/layout.tsx`에서 workspace.status='pending' → `/pending-approval` 리다이렉트.

**Tech Stack:** Drizzle ORM, `jose@6` (이미 설치됨), Next.js App Router, Vitest + PGlite

---

## 범위

이 플랜은 Phase 1만 다룬다. Phase 2(Admin UI 화면) 플랜은 `2026-05-27-admin-phase2-ui.md` 참조.

---

## 파일 맵

**신규 생성:**
- `lib/db/schema/admin.ts` — pg_profiles, verification_applications, admin_notes, risk_flags, admin_audit_logs
- `lib/auth/admin-session.ts` — signAdminToken, verifyAdminToken, requireAdminSession, setAdminCookie, clearAdminCookie
- `app/(public)/pending-approval/page.tsx` — 심사 중 안내 페이지
- `app/(public)/suspended/page.tsx` — 정지 안내 페이지
- `app/(public)/signup/pg/biz/page.tsx` — PG 사업자 정보 입력 단계
- `lib/server/actions/admin/__tests__/setup.test.ts` — admin 액션 테스트 헬퍼 확인용
- `lib/auth/__tests__/admin-session.test.ts`
- `lib/db/schema/__tests__/admin-schema.test.ts`
- `lib/server/actions/auth/__tests__/signupComplete-pending.test.ts`

**수정:**
- `lib/db/schema/_enums.ts` — workspaceStatusEnum, verificationStatusEnum 추가
- `lib/db/schema/workspaces.ts` — status, statusReason, reviewedAt 컬럼 추가
- `lib/db/schema/index.ts` — admin.ts export 추가
- `lib/auth/route-decision.ts` — /pending-approval, /suspended PUBLIC_PREFIXES 추가; /admin 패스스루
- `proxy.ts` — /admin/* JWT 검증 블록 추가
- `app/(app)/layout.tsx` — workspace.status 게이트 추가
- `lib/server/actions/workspace/_createWorkspace.ts` — status='pending' 기본값 적용, verification_application 생성
- `lib/server/repositories/drizzle/__tests__/_seed.ts` — seedBuyerWorkspace/seedPgWorkspace에 status 기본값 반영

---

## Task 1: DB 스키마 — 열거형 + workspaces 컬럼 추가

**Files:**
- Modify: `lib/db/schema/_enums.ts`
- Modify: `lib/db/schema/workspaces.ts`
- Create: `lib/db/schema/__tests__/admin-schema.test.ts`

- [ ] **Step 1: `_enums.ts`에 두 enum 추가**

```typescript
// lib/db/schema/_enums.ts 하단에 추가

export const workspaceStatusEnum = pgEnum('workspace_status', [
  'pending',
  'active',
  'suspended',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'submitted',
  'review_pending',
  'needs_more_info',
  'approved',
  'rejected',
]);
```

- [ ] **Step 2: `workspaces.ts` 컬럼 추가**

기존 `shareToken` 필드 다음에 세 컬럼 추가:

```typescript
// lib/db/schema/workspaces.ts
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaceTypeEnum, workspaceStatusEnum } from './_enums';
import { bizProfiles } from './biz-profiles';

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: workspaceTypeEnum('type').notNull(),
    name: text('name').notNull(),
    bizProfileId: uuid('biz_profile_id').references(() => bizProfiles.id, {
      onDelete: 'set null',
    }),
    shareToken: text('share_token')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()::text`),
    status: workspaceStatusEnum('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('workspaces_biz_profile_idx').on(t.bizProfileId)],
);
```

- [ ] **Step 3: 테스트 작성 (RED)**

```typescript
// lib/db/schema/__tests__/admin-schema.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces } from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });

describe('workspaces.status', () => {
  it('defaults to pending on insert', async () => {
    const [ws] = await db.insert(workspaces).values({
      type: 'pg',
      name: '테스트PG',
    }).returning();
    expect(ws.status).toBe('pending');
  });

  it('allows active and suspended values', async () => {
    const [ws] = await db.insert(workspaces).values({
      type: 'buyer',
      name: '테스트구매사',
      status: 'active',
    }).returning();
    expect(ws.status).toBe('active');
  });
});
```

- [ ] **Step 4: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/db/schema/__tests__/admin-schema.test.ts
```

Expected: FAIL ("column workspaces.status does not exist" 또는 타입 오류)

- [ ] **Step 5: 마이그레이션 생성**

```bash
pnpm db:generate
```

`drizzle/` 디렉터리에 새 마이그레이션 파일 생성됨 확인. 파일명 메모 (예: `0001_admin_schema.sql`).

- [ ] **Step 6: 테스트 재실행 — 통과 확인**

```bash
pnpm test lib/db/schema/__tests__/admin-schema.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 7: 커밋**

```bash
git add lib/db/schema/_enums.ts lib/db/schema/workspaces.ts lib/db/schema/__tests__/admin-schema.test.ts drizzle/
git commit -m "feat(db): workspace.status enum + pending default 추가"
```

---

## Task 2: DB 스키마 — admin 전용 테이블 5개

**Files:**
- Create: `lib/db/schema/admin.ts`
- Modify: `lib/db/schema/index.ts`
- Modify: `lib/db/schema/__tests__/admin-schema.test.ts` (테스트 추가)

- [ ] **Step 1: `lib/db/schema/admin.ts` 생성**

```typescript
import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { attachments } from './attachments';
import { verificationStatusEnum } from './_enums';

export const pgProfiles = pgTable(
  'pg_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    bizNo: text('biz_no'),
    serviceScope: jsonb('service_scope').$type<{
      paymentMethods: string[];
      industries: string[];
      volumeRange: string;
      integrationTypes: string[];
    }>(),
    slaDays: integer('sla_days'),
    salesContact: jsonb('sales_contact').$type<{
      name: string;
      email: string;
      phone: string;
    }>(),
    backupContact: jsonb('backup_contact').$type<{
      name: string;
      email: string;
      phone: string;
    }>(),
    licenseDocId: uuid('license_doc_id').references(() => attachments.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('pg_profiles_workspace_idx').on(t.workspaceId)],
);

export const verificationApplications = pgTable(
  'verification_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    orgType: text('org_type').notNull(), // 'buyer' | 'pg'
    status: verificationStatusEnum('status').notNull().default('submitted'),
    reviewedBy: text('reviewed_by'), // 어드민 식별자 (env 기반, FK 없음)
    reason: text('reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(sql`now()`),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [index('verification_applications_workspace_idx').on(t.workspaceId)],
);

export const adminNotes = pgTable(
  'admin_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(), // 'workspace' | 'rfp' | 'bid' | 'user'
    entityId: uuid('entity_id').notNull(),
    body: text('body').notNull(),
    createdBy: text('created_by').notNull(), // 어드민 식별자
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('admin_notes_entity_idx').on(t.entityType, t.entityId)],
);

export const riskFlags = pgTable(
  'risk_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    flagType: text('flag_type').notNull(),
    // flagType values: biz_verify_failed | doc_missing | low_response_rate |
    //   deadline_approaching | quote_invalid | no_followup
    severity: text('severity').notNull(), // 'critical' | 'warning' | 'info'
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('risk_flags_entity_idx').on(t.entityType, t.entityId)],
);

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actor: text('actor').notNull(), // 어드민 식별자
    action: text('action').notNull(),
    // action values: workspace.approve | workspace.reject | workspace.suspend |
    //   workspace.unsuspend | bid.hide | rfp.extend | rfp.cancel |
    //   note.create | reminder.send | document.viewed
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    payloadJson: jsonb('payload_json').$type<{
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      reason?: string;
    }>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('admin_audit_logs_entity_idx').on(t.entityType, t.entityId)],
);
```

- [ ] **Step 2: `lib/db/schema/index.ts` export 추가**

파일 마지막 줄에 추가:

```typescript
export * from './admin';
```

- [ ] **Step 3: 테스트 추가 (RED)**

`lib/db/schema/__tests__/admin-schema.test.ts`에 아래 describe 블록 추가:

```typescript
import {
  pgProfiles, verificationApplications,
  adminNotes, riskFlags, adminAuditLogs,
} from '@/lib/db/schema';

describe('admin tables', () => {
  it('verificationApplications defaults status to submitted', async () => {
    const [ws] = await db.insert(workspaces).values({ type: 'buyer', name: 'B' }).returning();
    const [app] = await db
      .insert(verificationApplications)
      .values({ workspaceId: ws.id, orgType: 'buyer' })
      .returning();
    expect(app.status).toBe('submitted');
    expect(app.reviewedBy).toBeNull();
  });

  it('adminAuditLogs inserts and retrieves', async () => {
    const [ws] = await db.insert(workspaces).values({ type: 'pg', name: 'P' }).returning();
    await db.insert(adminAuditLogs).values({
      actor: 'admin',
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: ws.id,
      payloadJson: { after: { status: 'active' } },
    });
    const logs = await db.select().from(adminAuditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('workspace.approve');
  });
});
```

- [ ] **Step 4: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/db/schema/__tests__/admin-schema.test.ts
```

Expected: FAIL (테이블 미존재)

- [ ] **Step 5: 마이그레이션 생성 + 확인**

```bash
pnpm db:generate
```

새 마이그레이션 파일에 5개 CREATE TABLE 포함됨 확인.

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm test lib/db/schema/__tests__/admin-schema.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 7: 커밋**

```bash
git add lib/db/schema/admin.ts lib/db/schema/index.ts lib/db/schema/__tests__/admin-schema.test.ts drizzle/
git commit -m "feat(db): admin 전용 테이블 5개 추가 (pg_profiles, verification_applications, admin_notes, risk_flags, admin_audit_logs)"
```

---

## Task 3: 어드민 JWT 인증 (`lib/auth/admin-session.ts`)

**Files:**
- Create: `lib/auth/admin-session.ts`
- Create: `lib/auth/__tests__/admin-session.test.ts`

- [ ] **Step 1: 테스트 작성 (RED)**

```typescript
// lib/auth/__tests__/admin-session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signAdminToken, verifyAdminToken } from '../admin-session';

// jose는 Node 환경에서 동작
beforeEach(() => {
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-secret-min-32-characters-long!!');
});

describe('signAdminToken / verifyAdminToken', () => {
  it('서명된 토큰을 검증하면 adminId를 반환한다', async () => {
    const token = await signAdminToken('admin');
    const result = await verifyAdminToken(token);
    expect(result).not.toBeNull();
    expect(result!.adminId).toBe('admin');
  });

  it('잘못된 토큰은 null을 반환한다', async () => {
    const result = await verifyAdminToken('invalid.token.here');
    expect(result).toBeNull();
  });

  it('만료된 토큰은 null을 반환한다', async () => {
    // 만료 시각이 과거인 토큰 직접 생성
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-secret-min-32-characters-long!!');
    const expired = await new SignJWT({ adminId: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(new Date(Date.now() - 1000))
      .sign(secret);
    const result = await verifyAdminToken(expired);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/auth/__tests__/admin-session.test.ts
```

Expected: FAIL ("Cannot find module '../admin-session'")

- [ ] **Step 3: `lib/auth/admin-session.ts` 구현**

```typescript
import { SignJWT, jwtVerify } from 'jose';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

const COOKIE_NAME = 'admin-token';
const EXPIRY = '8h';

function getSecret(): Uint8Array {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_SESSION_SECRET must be at least 32 chars');
  return new TextEncoder().encode(s);
}

export async function signAdminToken(adminId: string): Promise<string> {
  return new SignJWT({ adminId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyAdminToken(
  token: string,
): Promise<{ adminId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { adminId: payload.adminId as string };
  } catch {
    return null;
  }
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;

export const ADMIN_COOKIE_OPTIONS: Partial<ResponseCookie> = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 8 * 60 * 60, // 8시간
  path: '/',
};
```

> **Note:** `requireAdminSession()` (server component용) 는 Task 7에서 추가. 지금은 순수 토큰 함수만.

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test lib/auth/__tests__/admin-session.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/auth/admin-session.ts lib/auth/__tests__/admin-session.test.ts
git commit -m "feat(auth): 어드민 JWT 서명/검증 유틸 추가 (jose HS256)"
```

---

## Task 4: 라우팅 — route-decision + proxy.ts 확장

**Files:**
- Modify: `lib/auth/route-decision.ts`
- Modify: `proxy.ts`
- Modify: `lib/auth/__tests__/proxy-logic.test.ts` (테스트 추가)

- [ ] **Step 1: route-decision 테스트 추가 (RED)**

`lib/auth/__tests__/proxy-logic.test.ts` 기존 파일에 아래 describe 블록 추가:

```typescript
describe('admin + gate 라우트 패스스루', () => {
  it('/admin/* 는 인증 여부와 무관하게 pass-through', () => {
    expect(decideRoute('/admin', '', false)).toEqual({ kind: 'next' });
    expect(decideRoute('/admin/review', '', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/admin/login', '', false)).toEqual({ kind: 'next' });
  });

  it('/pending-approval 은 로그인된 사용자도 접근 가능 (home 리다이렉트 없음)', () => {
    expect(decideRoute('/pending-approval', '', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/pending-approval', '', false)).toEqual({ kind: 'next' });
  });

  it('/suspended 는 로그인된 사용자도 접근 가능', () => {
    expect(decideRoute('/suspended', '', true)).toEqual({ kind: 'next' });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/auth/__tests__/proxy-logic.test.ts
```

Expected: FAIL (`/admin/review` + authenticated → `{ kind: 'redirect', to: '/home' }` 반환)

- [ ] **Step 3: `route-decision.ts` 수정**

`PUBLIC_PREFIXES` 배열에 세 항목 추가:

```typescript
export const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/password',
  '/invite',
  '/auth',
  '/logout',
  '/admin',           // ← 신규: 어드민 라우트 (JWT 검증은 proxy.ts에서)
  '/pending-approval', // ← 신규: 심사 중 게이트 페이지
  '/suspended',       // ← 신규: 정지 게이트 페이지
];
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test lib/auth/__tests__/proxy-logic.test.ts
```

Expected: PASS (모든 테스트)

- [ ] **Step 5: `proxy.ts` 수정 — /admin/* JWT 검증 블록 추가**

```typescript
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

import authConfig from './auth.config';
import { decideRoute } from './lib/auth/route-decision';
import { ADMIN_COOKIE_NAME } from './lib/auth/admin-session';

const { auth } = NextAuth(authConfig);

function getAdminSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET ?? '');
}

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;

  // Admin 라우트: /admin/login 제외하고 JWT 검증
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return NextResponse.redirect(new URL('/admin/login', req.url));
    try {
      await jwtVerify(token, getAdminSecret());
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
  }

  const isAuthenticated = !!req.auth;
  const decision = decideRoute(pathname, search, isAuthenticated);
  if (decision.kind === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!monitoring|api|_next|favicon.ico|icon.svg|apple-icon|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sitemap.xml|fonts|file|globe|next|vercel|window).*)',
  ],
};
```

- [ ] **Step 6: typecheck 확인**

```bash
pnpm tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add lib/auth/route-decision.ts lib/auth/__tests__/proxy-logic.test.ts proxy.ts
git commit -m "feat(auth): /admin/* JWT 게이트 + /pending-approval /suspended 패스스루"
```

---

## Task 5: `(app)/layout.tsx` workspace.status 게이트

**Files:**
- Modify: `app/(app)/layout.tsx`
- Create: `app/(public)/pending-approval/page.tsx`
- Create: `app/(public)/suspended/page.tsx`

- [ ] **Step 1: pending-approval 페이지 생성**

```typescript
// app/(public)/pending-approval/page.tsx
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function PendingApprovalPage() {
  const session = await auth();
  // 미로그인 상태면 로그인으로
  if (!session?.user?.id) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-title-large">입점 심사 중</h1>
        <p className="text-body-medium text-on-surface-variant">
          계정이 검토 중입니다. 승인 완료 후 이메일로 안내드립니다.
        </p>
        <p className="text-body-small text-on-surface-variant">
          문의: <a href="mailto:support@suppoter-b.com" className="underline">support@suppoter-b.com</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: suspended 페이지 생성**

```typescript
// app/(public)/suspended/page.tsx
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function SuspendedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-title-large">계정 이용 정지</h1>
        <p className="text-body-medium text-on-surface-variant">
          계정 이용이 일시 제한되었습니다.
        </p>
        <p className="text-body-small text-on-surface-variant">
          문의: <a href="mailto:support@suppoter-b.com" className="underline">support@suppoter-b.com</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `(app)/layout.tsx` 게이트 추가**

기존 `workspaces.length === 0` 체크 다음 라인(redirect('/logout') 바로 뒤)에 아래 추가:

```typescript
// 워크스페이스 상태 게이트 — pending/suspended이면 앱 접근 차단
if (active.status === 'pending') {
  redirect('/pending-approval');
}
if (active.status === 'suspended') {
  redirect('/suspended');
}
```

`active` 변수는 기존 코드에서 `workspaces.find(...)` 로 이미 선언되어 있음.

> **주의:** `Workspace` 타입(`lib/types/workspace.ts`)에 `status` 필드가 없을 수 있음. 타입 오류 발생 시 아래 Task 5 Step 4 확인.

- [ ] **Step 4: Workspace 타입에 status 추가**

```bash
grep -n "status" /Users/yeonseong/project/bidit/lib/types/workspace.ts
```

`status` 필드가 없으면 `WorkspaceSummary` 또는 해당 타입에 추가:

```typescript
status: 'pending' | 'active' | 'suspended';
```

그리고 `workspace.listForUser` 쿼리가 `status`를 select하는지 확인:

```bash
grep -n "status" /Users/yeonseong/project/bidit/lib/server/repositories/drizzle/workspace.ts
```

`status`를 select하지 않으면 쿼리에 포함 필요 (Task 5 Step 5 참조).

- [ ] **Step 5: workspace 리포지토리 listForUser에 status 포함 확인**

```bash
cat /Users/yeonseong/project/bidit/lib/server/repositories/drizzle/workspace.ts | grep -A5 "listForUser"
```

`select({ ..., status: workspaces.status, ... })` 형태로 추가. 기존 `select()` (전체 컬럼)이면 이미 포함.

- [ ] **Step 6: typecheck 확인**

```bash
pnpm tsc --noEmit
```

오류 없을 때까지 타입 수정.

- [ ] **Step 7: 커밋**

```bash
git add app/\(public\)/pending-approval/page.tsx app/\(public\)/suspended/page.tsx app/\(app\)/layout.tsx lib/types/
git commit -m "feat(gate): workspace.status pending/suspended 시 앱 접근 차단"
```

---

## Task 6: signupCompleteAction — pending 기본값 + verification_application 생성

**Files:**
- Modify: `lib/server/actions/workspace/_createWorkspace.ts`
- Create: `lib/server/actions/auth/__tests__/signupComplete-pending.test.ts`

- [ ] **Step 1: 테스트 작성 (RED)**

```typescript
// lib/server/actions/auth/__tests__/signupComplete-pending.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, verificationApplications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { createWorkspaceInTx } from '@/lib/server/actions/workspace/_createWorkspace';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });

describe('createWorkspaceInTx — pending status + verification_application', () => {
  it('buyer 워크스페이스 생성 시 status=pending', async () => {
    const user = await seedUser(db);
    await createWorkspaceInTx(db, {
      userId: user.id,
      type: 'buyer',
      name: '구매사',
    });
    const [ws] = await db.select().from(workspaces);
    expect(ws.status).toBe('pending');
  });

  it('pg 워크스페이스 생성 시 status=pending', async () => {
    const user = await seedUser(db);
    await createWorkspaceInTx(db, {
      userId: user.id,
      type: 'pg',
      name: '판매사',
    });
    const [ws] = await db.select().from(workspaces);
    expect(ws.status).toBe('pending');
  });

  it('워크스페이스 생성 시 verification_application 행이 생성된다', async () => {
    const user = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: user.id,
      type: 'buyer',
      name: '구매사',
    });
    const apps = await db
      .select()
      .from(verificationApplications)
      .where(eq(verificationApplications.workspaceId, workspaceId));
    expect(apps).toHaveLength(1);
    expect(apps[0].status).toBe('submitted');
    expect(apps[0].orgType).toBe('buyer');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/server/actions/auth/__tests__/signupComplete-pending.test.ts
```

Expected: FAIL (workspace.status 없음 또는 verification_application 미생성)

- [ ] **Step 3: `_createWorkspace.ts` 수정**

import에 `verificationApplications` 추가:

```typescript
import { bizProfiles, columns, users, workspaceMembers, workspaces, verificationApplications } from '@/lib/db/schema';
```

`createWorkspaceInTx` 함수 내 워크스페이스 insert 직후에 `verification_applications` insert 추가:

```typescript
// 기존: await tx.insert(workspaces).values({ id: wsId, type: input.type, name: input.name, bizProfileId });
// 변경 없음 — workspace.status DEFAULT 'pending' 이 DB 레벨에서 처리됨

// 아래를 워크스페이스 insert 다음에 추가
await tx.insert(verificationApplications).values({
  workspaceId: wsId,
  orgType: input.type, // 'buyer' | 'pg'
});
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test lib/server/actions/auth/__tests__/signupComplete-pending.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: 기존 워크스페이스 seed 헬퍼 수정**

`lib/server/repositories/drizzle/__tests__/_seed.ts`의 `seedBuyerWorkspace` / `seedPgWorkspace`에
`status: 'active'` 를 명시적으로 전달 (테스트 환경에서 pending 기본값에 막히지 않도록):

```typescript
// seedBuyerWorkspace 내 workspaces.insert 부분
await db.insert(workspaces).values({
  id,
  type: 'buyer',
  name: overrides?.name ?? '구매사',
  bizProfileId: overrides?.bizProfileId ?? null,
  status: 'active',  // ← 추가: 테스트 시드는 이미 승인된 상태
});
```

동일하게 `seedPgWorkspace`도 `status: 'active'` 추가.

- [ ] **Step 6: 전체 테스트 통과 확인**

```bash
pnpm test
```

Expected: 기존 테스트 모두 PASS (seed 변경으로 인한 회귀 없음)

- [ ] **Step 7: 커밋**

```bash
git add lib/server/actions/workspace/_createWorkspace.ts \
  lib/server/actions/auth/__tests__/signupComplete-pending.test.ts \
  lib/server/repositories/drizzle/__tests__/_seed.ts
git commit -m "feat(signup): 신규 워크스페이스 status=pending 기본값 + verification_application 생성"
```

---

## Task 7: PG 회원가입 — 사업자 정보 단계 추가

**Files:**
- Create: `app/(public)/signup/pg/biz/page.tsx`
- Modify: `lib/server/actions/auth/signupCompleteAction.ts` — pg_profiles 생성 분기

- [ ] **Step 1: PG 회원가입 사업자 정보 입력 페이지 생성**

```typescript
// app/(public)/signup/pg/biz/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod/v4';
import { signIn } from 'next-auth/react';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';

const PAYMENT_METHODS = ['카드', '간편결제', '계좌이체', '휴대폰', '가상계좌', '해외결제'] as const;
const VOLUME_RANGES = ['1억 미만', '1억~10억', '10억~100억', '100억 이상'] as const;

const BizSchema = z.object({
  bizNo: z.string().optional(),
  paymentMethods: z.array(z.string()).min(1, '결제수단을 하나 이상 선택하세요'),
  volumeRange: z.string().min(1),
  salesName: z.string().min(1, '담당자 이름을 입력하세요'),
  salesEmail: z.string().email('유효한 이메일을 입력하세요'),
  salesPhone: z.string().min(9, '연락처를 입력하세요'),
});

export default function PgBizPage() {
  const router = useRouter();
  const draft = useSignupDraftStore((s) => s.draft);
  const [form, setForm] = useState({
    bizNo: '',
    paymentMethods: [] as string[],
    volumeRange: '',
    salesName: '',
    salesEmail: '',
    salesPhone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (!draft?.email || !draft?.wsName) {
    router.replace('/signup/pg/workspace');
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = BizSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setLoading(true);
    try {
      const { signupCompleteAction } = await import('@/lib/server/actions/auth/signupCompleteAction');
      const res = await signupCompleteAction({
        email: draft.email!,
        name: draft.name!,
        password: draft.password!,
        phone: draft.phone!,
        phoneVerificationId: draft.phoneVerificationId!,
        wsKind: 'pg',
        wsName: draft.wsName!,
        pgProfile: {
          bizNo: form.bizNo || undefined,
          serviceScope: {
            paymentMethods: form.paymentMethods,
            industries: [],
            volumeRange: form.volumeRange,
            integrationTypes: [],
          },
          salesContact: {
            name: form.salesName,
            email: form.salesEmail,
            phone: form.salesPhone,
          },
        },
      });
      if (!res.ok) { setErrors({ form: res.error }); return; }
      await signIn('credentials', { email: res.data.email, password: res.data.password, redirect: false });
      router.push(res.data.redirectTo);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-headline-small">서비스 정보 입력</h1>
      <p className="text-body-medium text-on-surface-variant">심사에 필요한 정보를 입력해 주세요.</p>

      <div>
        <label className="text-label-medium">사업자등록번호 (선택)</label>
        <input
          className="mock-input mt-1 w-full"
          placeholder="000-00-00000"
          value={form.bizNo}
          onChange={e => setForm(p => ({ ...p, bizNo: e.target.value }))}
        />
      </div>

      <div>
        <label className="text-label-medium">서비스 가능 결제수단 *</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {PAYMENT_METHODS.map(m => (
            <label key={m} className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={form.paymentMethods.includes(m)}
                onChange={e => setForm(p => ({
                  ...p,
                  paymentMethods: e.target.checked
                    ? [...p.paymentMethods, m]
                    : p.paymentMethods.filter(x => x !== m),
                }))}
              />
              <span className="text-body-small">{m}</span>
            </label>
          ))}
        </div>
        {errors.paymentMethods && <p className="text-error text-body-small">{errors.paymentMethods}</p>}
      </div>

      <div>
        <label className="text-label-medium">월 거래액 구간 *</label>
        <select
          className="mock-input mt-1 w-full"
          value={form.volumeRange}
          onChange={e => setForm(p => ({ ...p, volumeRange: e.target.value }))}
        >
          <option value="">선택</option>
          {VOLUME_RANGES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      <fieldset className="border border-outline rounded p-3 space-y-2">
        <legend className="text-label-medium px-1">영업 담당자 *</legend>
        <input className="mock-input w-full" placeholder="이름" value={form.salesName}
          onChange={e => setForm(p => ({ ...p, salesName: e.target.value }))} />
        {errors.salesName && <p className="text-error text-body-small">{errors.salesName}</p>}
        <input className="mock-input w-full" placeholder="이메일" type="email" value={form.salesEmail}
          onChange={e => setForm(p => ({ ...p, salesEmail: e.target.value }))} />
        {errors.salesEmail && <p className="text-error text-body-small">{errors.salesEmail}</p>}
        <input className="mock-input w-full" placeholder="전화번호" value={form.salesPhone}
          onChange={e => setForm(p => ({ ...p, salesPhone: e.target.value }))} />
        {errors.salesPhone && <p className="text-error text-body-small">{errors.salesPhone}</p>}
      </fieldset>

      {errors.form && <p className="text-error text-body-small">{errors.form}</p>}
      <button type="submit" disabled={loading} className="mock-button w-full">
        {loading ? 'LOADING…' : '완료'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `signupCompleteAction.ts` — PgProfile 입력 타입 + 분기 추가**

`Input` 스키마에 `pgProfile` 필드 추가:

```typescript
const PgProfileInput = z
  .object({
    bizNo: z.string().optional(),
    serviceScope: z.object({
      paymentMethods: z.array(z.string()),
      industries: z.array(z.string()),
      volumeRange: z.string(),
      integrationTypes: z.array(z.string()),
    }),
    salesContact: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(9),
    }),
    backupContact: z.object({
      name: z.string(),
      email: z.string(),
      phone: z.string(),
    }).optional(),
    slaDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

// Input 객체에 추가:
pgProfile: PgProfileInput.optional(),
```

`signupCompleteAction` 내 `wsKind === 'pg'` 분기에서 `createWorkspaceInTx` 호출 후 `pg_profiles` insert:

```typescript
// createWorkspaceInTx 이후
if (parsed.data.wsKind === 'pg' && parsed.data.pgProfile) {
  await db.insert(pgProfiles).values({
    workspaceId: result.workspaceId,
    bizNo: parsed.data.pgProfile.bizNo ?? null,
    serviceScope: parsed.data.pgProfile.serviceScope,
    salesContact: parsed.data.pgProfile.salesContact,
    backupContact: parsed.data.pgProfile.backupContact ?? null,
    slaDays: parsed.data.pgProfile.slaDays ?? null,
  });
}
```

import에 `pgProfiles` 추가:
```typescript
import { users, phoneOtps, pgProfiles } from '@/lib/db/schema';
```

- [ ] **Step 3: PG 회원가입 workspace 단계 — biz 단계로 이동 처리**

`app/(public)/signup/pg/workspace/page.tsx`에서 완료 후 `/signup/pg/biz`로 라우팅되는지 확인. 기존 코드가 `router.push('/inbox')`를 직접 호출한다면, `signupCompleteAction`을 biz 페이지에서 호출하도록 변경(위 Step 1의 `handleSubmit`에서 이미 처리).

기존 workspace 페이지는 draft에 `wsName`만 저장하고 다음 단계로 이동하도록 변경:

```typescript
// app/(public)/signup/pg/workspace/page.tsx 의 완료 핸들러
// 기존: signupCompleteAction 호출
// 변경: draft에 wsName 저장 후 /signup/pg/biz 이동
useSignupDraftStore.getState().setDraft({ wsName: form.wsName });
router.push('/signup/pg/biz');
```

> **Note:** 기존 workspace 페이지가 어떻게 구현되어 있는지 먼저 확인:
> ```bash
> cat app/\(public\)/signup/pg/workspace/page.tsx | head -80
> ```

- [ ] **Step 4: typecheck + 전체 테스트**

```bash
pnpm tsc --noEmit && pnpm test
```

Expected: 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/signup/pg/biz/ lib/server/actions/auth/signupCompleteAction.ts app/\(public\)/signup/pg/workspace/
git commit -m "feat(signup/pg): 사업자 정보 입력 단계 추가 + pg_profiles 생성"
```

---

## Task 8: requireAdminSession 추가 + 전체 Phase 1 검증

**Files:**
- Modify: `lib/auth/admin-session.ts` — requireAdminSession 추가
- Modify: `lib/auth/__tests__/admin-session.test.ts` — 테스트 추가

- [ ] **Step 1: requireAdminSession 테스트 추가 (RED)**

```typescript
// lib/auth/__tests__/admin-session.test.ts 에 추가
import { vi } from 'vitest';

describe('requireAdminSession', () => {
  it('쿠키 없으면 /admin/login으로 redirect', async () => {
    // next/headers cookies mock
    vi.mock('next/headers', () => ({
      cookies: () => ({
        get: () => undefined,
      }),
    }));
    vi.mock('next/navigation', () => ({
      redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
    }));

    const { requireAdminSession } = await import('../admin-session');
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/admin/login');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test lib/auth/__tests__/admin-session.test.ts
```

Expected: FAIL (`requireAdminSession is not a function`)

- [ ] **Step 3: requireAdminSession 구현**

`lib/auth/admin-session.ts`에 추가:

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function requireAdminSession(): Promise<{ adminId: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const session = await verifyAdminToken(token);
  if (!session) redirect('/admin/login');
  return session;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test lib/auth/__tests__/admin-session.test.ts
```

Expected: PASS

- [ ] **Step 5: Phase 1 전체 테스트 + typecheck**

```bash
pnpm tsc --noEmit && pnpm test
```

Expected: 모두 통과

- [ ] **Step 6: 기존 사용자 마이그레이션 메모**

> 프로덕션 배포 전 아래 SQL 실행 필요 (기존 사용자 active 처리):
> ```sql
> UPDATE workspaces SET status = 'active' WHERE created_at < NOW();
> ```
> 이 SQL은 배포 스크립트에 포함하거나 `drizzle-kit push` 이후 수동 실행.

- [ ] **Step 7: 최종 커밋**

```bash
git add lib/auth/admin-session.ts lib/auth/__tests__/admin-session.test.ts
git commit -m "feat(auth): requireAdminSession 추가 — Phase 1 Foundation 완료"
```

---

## Phase 1 검증 체크리스트

- [ ] `pnpm tsc --noEmit` 통과
- [ ] `pnpm test` 전체 통과
- [ ] `/signup/pg/biz` 페이지 진입 확인 (`pnpm dev` 후 브라우저)
- [ ] PG 회원가입 완료 후 `/pending-approval` 리다이렉트 확인
- [ ] 구매사 회원가입 완료 후 `/pending-approval` 리다이렉트 확인
- [ ] `/admin/login` 진입 시 쿠키 없이도 접근 가능 확인
- [ ] `/admin` 직접 진입 시 `/admin/login`으로 리다이렉트 확인

Phase 1 완료 후 `2026-05-27-admin-phase2-ui.md` 플랜으로 이동.
