# Account Deletion (계정 탈퇴) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 유저가 계정을 탈퇴할 수 있도록 한다. 탈퇴 시 각 워크스페이스에 admin이 최소 1명 이상 남아 있도록 강제한다.

**Architecture:** 소프트 딜리트 방식 (`users.deletedAt` 타임스탬프). 탈퇴 전 마지막-admin 제약 검사 → 단독 워크스페이스 삭제 → 멤버십 제거 → `deletedAt = now()` 설정. 로그인 차단은 `auth.ts authorize()` 에서 `deletedAt IS NOT NULL` 체크.

**Tech Stack:** Drizzle ORM + PGlite (tests), Next.js Server Actions, `next-auth/react` `signOut`, `@base-ui/react` Dialog, `vitest` + `@testing-library/react`

---

## File Map

| 파일 | 작업 |
|------|------|
| `lib/db/schema/users.ts` | `deletedAt` 컬럼 추가 |
| `auth.ts` | `deletedAt IS NOT NULL` → login 차단 |
| `lib/server/actions/auth/getDeleteAccountStatus.ts` | 사전 체크 Server Action (신규) |
| `lib/server/actions/auth/__tests__/getDeleteAccountStatus.test.ts` | TDD 테스트 (신규) |
| `lib/server/actions/auth/deleteAccountAction.ts` | 탈퇴 실행 Server Action (신규) |
| `lib/server/actions/auth/__tests__/deleteAccountAction.test.ts` | TDD 테스트 (신규) |
| `components/settings/DeleteAccountSection.tsx` | UI 컴포넌트 (신규) |
| `components/settings/__tests__/DeleteAccountSection.test.tsx` | UI 테스트 (신규) |
| `app/(app)/settings/profile/page.tsx` | `<DeleteAccountSection />` 추가 |

---

## Task 1: Schema — `deletedAt` 컬럼 추가

**Files:**
- Modify: `lib/db/schema/users.ts`

> TDD 면제: 순수 스키마 변경 (config 파일 상당).

- [ ] **Step 1: `deletedAt` 컬럼 추가**

`lib/db/schema/users.ts` 의 `updatedAt` 바로 앞에 한 줄 추가:

```typescript
// 기존 코드 (updatedAt 위에 삽입)
deletedAt: timestamp('deleted_at', { withTimezone: true }),
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
```

최종 파일에서 `users` 테이블 정의는 아래와 같아야 한다:

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  avatarColor: text('avatar_color').notNull().default('#000'),
  status: text('status').notNull().default('active'),
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  lastActiveWorkspaceId: uuid('last_active_workspace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
```

- [ ] **Step 2: drizzle-kit push 로 DB에 적용**

```bash
pnpm drizzle-kit push
```

Expected: `deleted_at` 컬럼이 `users` 테이블에 추가됨. 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema/users.ts
git commit -m "chore(schema): add deletedAt column to users for soft-delete"
```

---

## Task 2: Auth — 탈퇴 계정 로그인 차단

**Files:**
- Modify: `auth.ts`

> TDD 면제: auth.ts 는 Next-Auth 설정 파일. 탈퇴 계정 로그인 차단은 Task 4의 deleteAccountAction 테스트에서 간접 검증됨.

- [ ] **Step 1: `authorize` 콜백에 `deletedAt` 체크 추가**

`auth.ts`의 `if (!user) return null;` 바로 다음 줄에 추가:

```typescript
if (!user) return null;
if (user.deletedAt) return null; // 탈퇴 계정 로그인 차단
```

최종 `authorize` 콜백:

```typescript
async authorize(creds) {
  if (!creds?.email || !creds?.password) return null;
  const email = String(creds.email).toLowerCase().trim();
  const password = String(creds.password);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return null;
  if (user.deletedAt) return null; // 탈퇴 계정 로그인 차단

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  const member = await resolveInitialMembership(
    db,
    user.id,
    user.lastActiveWorkspaceId,
  );

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    workspaceId: member?.workspaceId,
    workspaceType: member?.workspaceType,
    role: member?.role,
  };
},
```

- [ ] **Step 2: Commit**

```bash
git add auth.ts
git commit -m "feat(auth): block login for soft-deleted accounts"
```

---

## Task 3: Server Action — `getDeleteAccountStatus` (TDD)

**Files:**
- Create: `lib/server/actions/auth/getDeleteAccountStatus.ts`
- Create: `lib/server/actions/auth/__tests__/getDeleteAccountStatus.test.ts`

### Step 1-4: RED — 테스트 먼저

- [ ] **Step 1: 테스트 파일 작성**

`lib/server/actions/auth/__tests__/getDeleteAccountStatus.test.ts` 파일 생성:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  seedPgWorkspace,
  seedBuyerWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: {
  value: { user: { id: string; workspaceId: string | null } } | null;
} = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { getDeleteAccountStatus } from '../getDeleteAccountStatus';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  sessionRef.value = null;
});

afterEach(() => {
  __setActionDbForTest(undefined);
  __resetForTest();
});

describe('getDeleteAccountStatus', () => {
  it('returns UNAUTHENTICATED when no session', async () => {
    const r = await getDeleteAccountStatus();
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns empty lists when user has no memberships', async () => {
    const user = await seedUser(db, { email: 'solo@example.com' });
    sessionRef.value = { user: { id: user.id, workspaceId: null } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({ ok: true, blockingWorkspaces: [], soloWorkspaces: [] });
  });

  it('returns workspace in soloWorkspaces when user is sole member', async () => {
    const ws = await seedPgWorkspace(db, '내 워크스페이스');
    const user = await seedUser(db, { email: 'only@example.com' });
    await seedMembership(db, ws.id, user.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [{ id: ws.id, name: '내 워크스페이스' }],
    });
  });

  it('returns workspace in blockingWorkspaces when user is last admin with other members', async () => {
    const ws = await seedBuyerWorkspace(db, { name: '구매사A' });
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const member = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [{ id: ws.id, name: '구매사A' }],
      soloWorkspaces: [],
    });
  });

  it('does NOT block when there is another admin in the workspace', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const user = await seedUser(db, { email: 'a@example.com' });
    const other = await seedUser(db, { email: 'b@example.com' });
    await seedMembership(db, ws.id, user.id, 'admin');
    await seedMembership(db, ws.id, other.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
  });

  it('does NOT block when user is a plain member in a multi-member workspace', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const user = await seedUser(db, { email: 'member@example.com' });
    const admin = await seedUser(db, { email: 'admin@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, user.id, 'member');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/auth/__tests__/getDeleteAccountStatus.test.ts
```

Expected: FAIL — "Cannot find module '../getDeleteAccountStatus'"

### Step 3-4: GREEN — 최소 구현

- [ ] **Step 3: `getDeleteAccountStatus.ts` 구현**

`lib/server/actions/auth/getDeleteAccountStatus.ts` 파일 생성:

```typescript
'use server';

import { eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { workspaceMembers, workspaces } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type WorkspaceStub = { id: string; name: string };

export type GetDeleteAccountStatusResult =
  | { ok: true; blockingWorkspaces: WorkspaceStub[]; soloWorkspaces: WorkspaceStub[] }
  | { ok: false; error: string };

/**
 * Read-only pre-check: 탈퇴 전 워크스페이스 admin 제약을 미리 확인한다.
 * - blockingWorkspaces: 본인이 마지막 admin이고 다른 멤버가 있는 워크스페이스
 * - soloWorkspaces: 본인이 유일한 멤버인 워크스페이스 (탈퇴 시 자동 삭제 예정)
 */
export async function getDeleteAccountStatus(): Promise<GetDeleteAccountStatusResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const userId = session.user.id;
  const db = actionDb();

  // 유저의 모든 멤버십 조회 (워크스페이스 이름 포함)
  const myMemberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      name: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));

  const blockingWorkspaces: WorkspaceStub[] = [];
  const soloWorkspaces: WorkspaceStub[] = [];

  for (const membership of myMemberships) {
    const allMembers = await db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, membership.workspaceId));

    const stub: WorkspaceStub = { id: membership.workspaceId, name: membership.name };

    if (allMembers.length === 1) {
      // 본인만 있는 워크스페이스 → 탈퇴 시 삭제 예정
      soloWorkspaces.push(stub);
    } else if (membership.role === 'admin') {
      // 다른 멤버가 있는데 다른 admin이 없으면 → 차단
      const otherAdmins = allMembers.filter(
        (m) => m.userId !== userId && m.role === 'admin',
      );
      if (otherAdmins.length === 0) {
        blockingWorkspaces.push(stub);
      }
    }
  }

  return { ok: true, blockingWorkspaces, soloWorkspaces };
}
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/auth/__tests__/getDeleteAccountStatus.test.ts
```

Expected: 5개 테스트 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/actions/auth/getDeleteAccountStatus.ts \
        lib/server/actions/auth/__tests__/getDeleteAccountStatus.test.ts
git commit -m "feat(auth): add getDeleteAccountStatus pre-check action"
```

---

## Task 4: Server Action — `deleteAccountAction` (TDD)

**Files:**
- Create: `lib/server/actions/auth/deleteAccountAction.ts`
- Create: `lib/server/actions/auth/__tests__/deleteAccountAction.test.ts`

### Step 1-2: RED

- [ ] **Step 1: 테스트 파일 작성**

`lib/server/actions/auth/__tests__/deleteAccountAction.test.ts` 파일 생성:

```typescript
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  seedPgWorkspace,
  seedBuyerWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';

const sessionRef: {
  value: { user: { id: string; workspaceId: string | null } } | null;
} = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

// verifyPassword는 실제 bcrypt를 거치지 않도록 모킹
const verifyPasswordMock = vi.fn<[string, string], Promise<boolean>>();
vi.mock('@/lib/auth/password', () => ({
  verifyPassword: (plain: string, hash: string) => verifyPasswordMock(plain, hash),
}));

import { deleteAccountAction } from '../deleteAccountAction';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  sessionRef.value = null;
  verifyPasswordMock.mockReset();
});

afterEach(() => {
  __setActionDbForTest(undefined);
  __resetForTest();
});

async function isDeleted(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  return row?.deletedAt != null;
}

async function isMember(wsId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(
      eq(workspaceMembers.workspaceId, wsId),
    );
  return rows.some((r) => r.userId === userId);
}

async function workspaceExists(wsId: string): Promise<boolean> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, wsId));
  return rows.length > 0;
}

describe('deleteAccountAction', () => {
  it('returns UNAUTHENTICATED when no session', async () => {
    const r = await deleteAccountAction({ password: 'pw' });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns INVALID_PASSWORD when password is wrong', async () => {
    const user = await seedUser(db, { email: 'u@example.com' });
    sessionRef.value = { user: { id: user.id, workspaceId: null } };
    verifyPasswordMock.mockResolvedValue(false);

    const r = await deleteAccountAction({ password: 'wrong' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
    expect(await isDeleted(user.id)).toBe(false);
  });

  it('returns LAST_ADMIN when user is the only admin in a workspace with other members', async () => {
    const ws = await seedBuyerWorkspace(db, { name: '구매사A' });
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const member = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
      blockingWorkspaces: [{ id: ws.id, name: '구매사A' }],
    });
    expect(await isDeleted(admin.id)).toBe(false);
    expect(await isMember(ws.id, admin.id)).toBe(true);
  });

  it('soft-deletes user who is a plain member (non-admin) in a workspace', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const member = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');
    sessionRef.value = { user: { id: member.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(member.id)).toBe(true);
    expect(await isMember(ws.id, member.id)).toBe(false);
    expect(await isMember(ws.id, admin.id)).toBe(true); // 다른 멤버 영향 없음
  });

  it('soft-deletes user who is admin when another admin exists', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const adminA = await seedUser(db, { email: 'a@example.com' });
    const adminB = await seedUser(db, { email: 'b@example.com' });
    await seedMembership(db, ws.id, adminA.id, 'admin');
    await seedMembership(db, ws.id, adminB.id, 'admin');
    sessionRef.value = { user: { id: adminA.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(adminA.id)).toBe(true);
    expect(await isMember(ws.id, adminA.id)).toBe(false);
    expect(await isMember(ws.id, adminB.id)).toBe(true); // adminB 영향 없음
  });

  it('deletes solo workspace (sole member) when user withdraws', async () => {
    const ws = await seedPgWorkspace(db, '내 워크스페이스');
    const user = await seedUser(db, { email: 'owner@example.com' });
    await seedMembership(db, ws.id, user.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(user.id)).toBe(true);
    expect(await workspaceExists(ws.id)).toBe(false); // 워크스페이스 삭제됨
  });

  it('removes all memberships across multiple workspaces', async () => {
    const ws1 = await seedPgWorkspace(db, 'WS1');
    const ws2 = await seedBuyerWorkspace(db, { name: 'WS2' });
    const user = await seedUser(db, { email: 'multi@example.com' });
    const otherAdmin1 = await seedUser(db, { email: 'oa1@example.com' });
    const otherAdmin2 = await seedUser(db, { email: 'oa2@example.com' });
    await seedMembership(db, ws1.id, user.id, 'admin');
    await seedMembership(db, ws1.id, otherAdmin1.id, 'admin');
    await seedMembership(db, ws2.id, user.id, 'member');
    await seedMembership(db, ws2.id, otherAdmin2.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws1.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(user.id)).toBe(true);
    expect(await isMember(ws1.id, user.id)).toBe(false);
    expect(await isMember(ws2.id, user.id)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/auth/__tests__/deleteAccountAction.test.ts
```

Expected: FAIL — "Cannot find module '../deleteAccountAction'"

### Step 3-4: GREEN

- [ ] **Step 3: `deleteAccountAction.ts` 구현**

`lib/server/actions/auth/deleteAccountAction.ts` 파일 생성:

```typescript
'use server';

import { eq, inArray } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { workspaceMembers, workspaces, users } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { WorkspaceStub } from './getDeleteAccountStatus';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_PASSWORD' }
  | { ok: false; error: 'LAST_ADMIN'; blockingWorkspaces: WorkspaceStub[] };

export async function deleteAccountAction(input: {
  password: string;
}): Promise<DeleteAccountResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const userId = session.user.id;
  const db = actionDb();

  // 1. 비밀번호 검증
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!valid) return { ok: false, error: 'INVALID_PASSWORD' };

  // 2. 모든 멤버십 조회 (워크스페이스 이름 포함)
  const myMemberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      name: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));

  const blockingWorkspaces: WorkspaceStub[] = [];
  const soloWorkspaceIds: string[] = [];

  for (const membership of myMemberships) {
    const allMembers = await db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, membership.workspaceId));

    if (allMembers.length === 1) {
      soloWorkspaceIds.push(membership.workspaceId);
    } else if (membership.role === 'admin') {
      const otherAdmins = allMembers.filter(
        (m) => m.userId !== userId && m.role === 'admin',
      );
      if (otherAdmins.length === 0) {
        blockingWorkspaces.push({ id: membership.workspaceId, name: membership.name });
      }
    }
  }

  // 3. 차단 조건이 있으면 즉시 반환
  if (blockingWorkspaces.length > 0) {
    return { ok: false, error: 'LAST_ADMIN', blockingWorkspaces };
  }

  // 4. 트랜잭션: 단독 WS 삭제 → 나머지 멤버십 제거 → 소프트 딜리트
  await db.transaction(async (tx) => {
    // 단독 워크스페이스 삭제 (workspace_members는 CASCADE로 자동 삭제)
    if (soloWorkspaceIds.length > 0) {
      await tx
        .delete(workspaces)
        .where(inArray(workspaces.id, soloWorkspaceIds));
    }

    // 나머지 워크스페이스 멤버십 제거
    await tx
      .delete(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));

    // 소프트 딜리트: deletedAt 설정, lastActiveWorkspaceId 클리어
    await tx
      .update(users)
      .set({ deletedAt: new Date(), lastActiveWorkspaceId: null })
      .where(eq(users.id, userId));
  });

  return { ok: true };
}
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/auth/__tests__/deleteAccountAction.test.ts
```

Expected: 7개 테스트 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/actions/auth/deleteAccountAction.ts \
        lib/server/actions/auth/__tests__/deleteAccountAction.test.ts
git commit -m "feat(auth): add deleteAccountAction with last-admin guard and soft-delete"
```

---

## Task 5: UI — `DeleteAccountSection` 컴포넌트 (TDD)

**Files:**
- Create: `components/settings/DeleteAccountSection.tsx`
- Create: `components/settings/__tests__/DeleteAccountSection.test.tsx`

### Step 1-2: RED

- [ ] **Step 1: 테스트 파일 작성**

`components/settings/__tests__/DeleteAccountSection.test.tsx` 파일 생성:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getDeleteAccountStatus = vi.fn();
vi.mock('@/lib/server/actions/auth/getDeleteAccountStatus', () => ({
  getDeleteAccountStatus: (...a: unknown[]) => getDeleteAccountStatus(...a),
}));

const deleteAccountAction = vi.fn();
vi.mock('@/lib/server/actions/auth/deleteAccountAction', () => ({
  deleteAccountAction: (...a: unknown[]) => deleteAccountAction(...a),
}));

const signOut = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (...a: unknown[]) => signOut(...a),
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { DeleteAccountSection } from '../DeleteAccountSection';

beforeEach(() => {
  getDeleteAccountStatus.mockReset();
  deleteAccountAction.mockReset();
  signOut.mockReset();
  push.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DeleteAccountSection', () => {
  it('renders 탈퇴하기 button', () => {
    render(<DeleteAccountSection />);
    expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeDefined();
  });

  it('opens dialog and fetches status on button click', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => expect(getDeleteAccountStatus).toHaveBeenCalledOnce());
  });

  it('shows blocking workspaces when user is last admin', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [{ id: 'ws1', name: '구매사A' }],
      soloWorkspaces: [],
    });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() =>
      expect(screen.getByText('구매사A')).toBeDefined(),
    );
    expect(screen.queryByLabelText('비밀번호')).toBeNull(); // 비밀번호 필드 없음
  });

  it('shows password field and solo workspace warning when clear', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [{ id: 'ws2', name: '내 워크스페이스' }],
    });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());
    expect(screen.getByText('내 워크스페이스')).toBeDefined();
  });

  it('calls deleteAccountAction and signOut on successful submit', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
    deleteAccountAction.mockResolvedValue({ ok: true });
    signOut.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());

    await user.type(screen.getByLabelText('비밀번호'), 'my-password');
    await user.click(screen.getByRole('button', { name: '탈퇴 확인' }));

    await waitFor(() =>
      expect(deleteAccountAction).toHaveBeenCalledWith({ password: 'my-password' }),
    );
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login' }),
    );
  });

  it('shows inline error on INVALID_PASSWORD', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
    deleteAccountAction.mockResolvedValue({ ok: false, error: 'INVALID_PASSWORD' });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());

    await user.type(screen.getByLabelText('비밀번호'), 'wrong');
    await user.click(screen.getByRole('button', { name: '탈퇴 확인' }));

    await waitFor(() =>
      expect(screen.getByText('비밀번호가 올바르지 않아요.')).toBeDefined(),
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project jsdom components/settings/__tests__/DeleteAccountSection.test.tsx
```

Expected: FAIL — "Cannot find module '../DeleteAccountSection'"

### Step 3-4: GREEN

- [ ] **Step 3: `DeleteAccountSection.tsx` 구현**

`components/settings/DeleteAccountSection.tsx` 파일 생성:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/primitives/Button';
import { Field } from '@/components/primitives/Field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { getDeleteAccountStatus } from '@/lib/server/actions/auth/getDeleteAccountStatus';
import { deleteAccountAction } from '@/lib/server/actions/auth/deleteAccountAction';
import type { WorkspaceStub } from '@/lib/server/actions/auth/getDeleteAccountStatus';

type DialogState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'blocked'; blockingWorkspaces: WorkspaceStub[] }
  | { phase: 'ready'; soloWorkspaces: WorkspaceStub[] };

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({ phase: 'idle' });
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    setDialogState({ phase: 'loading' });
    setPassword('');
    setPasswordError('');

    const status = await getDeleteAccountStatus();
    if (!status.ok) {
      setOpen(false);
      return;
    }
    if (status.blockingWorkspaces.length > 0) {
      setDialogState({ phase: 'blocked', blockingWorkspaces: status.blockingWorkspaces });
    } else {
      setDialogState({ phase: 'ready', soloWorkspaces: status.soloWorkspaces });
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setDialogState({ phase: 'idle' });
    setPassword('');
    setPasswordError('');
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setPasswordError('');
    setSubmitting(true);

    const result = await deleteAccountAction({ password });
    setSubmitting(false);

    if (!result.ok) {
      if (result.error === 'INVALID_PASSWORD') {
        setPasswordError('비밀번호가 올바르지 않아요.');
      } else if (result.error === 'LAST_ADMIN') {
        setDialogState({
          phase: 'blocked',
          blockingWorkspaces: result.blockingWorkspaces,
        });
      }
      return;
    }

    await signOut({ callbackUrl: '/login' });
  };

  return (
    <section className="border border-[var(--md-sys-color-error)]/20 rounded-[var(--md-sys-shape-small)] p-4 space-y-3">
      <div>
        <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
          계정 탈퇴
        </p>
        <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
          탈퇴하면 모든 워크스페이스 멤버십이 삭제되며 복구할 수 없어요.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        color="error"
        variant="outlined"
        onClick={handleOpen}
      >
        탈퇴하기
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent showCloseButton={false} className="sm:max-w-[440px]">
          {dialogState.phase === 'loading' && (
            <>
              <DialogHeader>
                <DialogTitle>계정 탈퇴</DialogTitle>
              </DialogHeader>
              <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                LOADING…
              </p>
            </>
          )}

          {dialogState.phase === 'blocked' && (
            <>
              <DialogHeader>
                <DialogTitle>탈퇴 전 admin 위임 필요</DialogTitle>
                <DialogDescription>
                  아래 워크스페이스에서 다른 멤버에게 admin 권한을 먼저 위임하세요.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-[13px]">
                {dialogState.blockingWorkspaces.map((ws) => (
                  <li key={ws.id} className="flex items-center justify-between gap-3">
                    <span className="text-[var(--md-sys-color-on-surface)]">{ws.name}</span>
                    <Link
                      href="/settings/members"
                      className="text-[var(--md-sys-color-primary)] text-[12px] shrink-0 hover:underline"
                      onClick={handleClose}
                    >
                      멤버 설정 →
                    </Link>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button variant="outlined" size="sm" onClick={handleClose}>
                  닫기
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogState.phase === 'ready' && (
            <>
              <DialogHeader>
                <DialogTitle>정말 탈퇴하시겠어요?</DialogTitle>
                <DialogDescription>
                  탈퇴 후에는 복구가 불가능해요.
                </DialogDescription>
              </DialogHeader>

              {dialogState.soloWorkspaces.length > 0 && (
                <div className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] space-y-1">
                  <p>아래 워크스페이스는 멤버가 없어 함께 삭제돼요:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {dialogState.soloWorkspaces.map((ws) => (
                      <li key={ws.id}>{ws.name}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Field label="비밀번호" htmlFor="delete-account-password">
                <input
                  id="delete-account-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  aria-label="비밀번호"
                  className="w-full border-b border-[var(--md-sys-color-outline-variant)] bg-transparent py-1.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary)]"
                  disabled={submitting}
                  autoComplete="current-password"
                />
              </Field>

              {passwordError && (
                <p
                  role="alert"
                  className="text-[12px] text-[var(--md-sys-color-error)]"
                >
                  {passwordError}
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  color="error"
                  onClick={handleSubmit}
                  disabled={!password || submitting}
                >
                  {submitting ? 'LOADING…' : '탈퇴 확인'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project jsdom components/settings/__tests__/DeleteAccountSection.test.tsx
```

Expected: 6개 테스트 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add components/settings/DeleteAccountSection.tsx \
        components/settings/__tests__/DeleteAccountSection.test.tsx
git commit -m "feat(settings): add DeleteAccountSection component with dialog"
```

---

## Task 6: Profile 페이지에 연결

**Files:**
- Modify: `app/(app)/settings/profile/page.tsx`

> TDD 면제: page.tsx 는 단순 컴포넌트 조립 shell.

- [ ] **Step 1: import 추가**

`app/(app)/settings/profile/page.tsx` 상단 import 블록에 추가:

```typescript
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection';
```

- [ ] **Step 2: `<DeleteAccountSection />` 추가**

`</PageEnter>` 닫는 태그 바로 앞에 추가:

```tsx
{/* 계정 탈퇴 (danger zone) */}
<section>
  <div className="flex items-center gap-3 mb-3">
    <Label size="md" muted={false}>위험 영역</Label>
    <div className="flex-1 h-px bg-[var(--md-sys-color-error)]/20" />
  </div>
  <DeleteAccountSection />
</section>
```

최종 return 블록 끝 부분:

```tsx
      {/* ... 기존 워크스페이스 섹션 ... */}
      </section>

      {/* 계정 탈퇴 (danger zone) */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>위험 영역</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-error)]/20" />
        </div>
        <DeleteAccountSection />
      </section>
    </PageEnter>
  );
}
```

- [ ] **Step 3: 전체 테스트 실행**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```

Expected: 전체 suite PASS (신규 테스트 포함)

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"
```

Expected: 오류 없음

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/settings/profile/page.tsx
git commit -m "feat(settings/profile): add DeleteAccountSection to danger zone"
```

---

## Verification

1. dev 서버 실행: `pnpm dev`
2. `/settings/profile` 방문 → 하단 "위험 영역" 섹션 확인
3. **시나리오 A — 마지막 admin 차단**: 다른 멤버가 있는 워크스페이스의 유일한 admin 계정으로 로그인 → 탈퇴하기 클릭 → "탈퇴 전 admin 위임 필요" 화면과 멤버 설정 링크 확인
4. **시나리오 B — 단독 워크스페이스**: 혼자만 있는 워크스페이스 멤버 계정 → 탈퇴 진행 → 단독 워크스페이스 삭제 안내 확인 → 올바른 비밀번호 입력 → 탈퇴 후 `/login` 리다이렉트 확인
5. **시나리오 C — 잘못된 비밀번호**: 잘못된 비밀번호 입력 → "비밀번호가 올바르지 않아요." 인라인 에러 확인
6. **시나리오 D — 탈퇴 후 로그인 시도**: 탈퇴한 이메일로 로그인 시도 → 실패 확인
