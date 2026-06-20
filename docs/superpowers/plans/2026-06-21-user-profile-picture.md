# 사용자(계정) 프로필 사진 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 사용자 계정이 프로필 사진을 업로드·교체·삭제할 수 있게 하고, 그 사진을 앱 전체(헤더·사이드바·설정·멤버 목록·멘션·1:1/팀 채팅 메시지)에 표시한다.

**Architecture:** 워크스페이스 로고(`workspace_logo_blobs`) 패턴을 사용자용 `user_avatar_blobs`(Postgres bytea blob) + `DrizzleUserAvatarRepository`로 1:1 미러링한다. `users.avatar_updated_at`(nullable timestamptz) 단일 컬럼이 "사진 유무 + 캐시 버전"을 겸한다(NULL=없음→이니셜, non-NULL=있음→`?v` 캐시 버스트 키). 쓰기는 본인 세션만(`/api/user/avatar` POST/DELETE), 읽기는 로그인 필수(`/api/user/[id]/avatar` GET, `private, immutable` 캐시). `Avatar` primitive를 client 컴포넌트로 전환해 `userId`+`avatarUpdatedAt`가 있으면 `<img>`, 없으면 이니셜.

**Tech Stack:** Next.js 16 App Router (async params), Drizzle ORM + Postgres bytea, PGlite(단위 테스트), Vitest, React 19, Tailwind v4.

## Global Constraints

이 섹션의 규칙은 모든 태스크에 암묵적으로 포함된다.

- **TDD 필수 (Iron Law):** NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST. 매 태스크는 RED(`pnpm test <path>`로 실패 확인)→GREEN(최소 구현)→커밋. 스키마 파일(`*.ts` under `lib/db/schema`)·순수 prop 전달 렌더는 TDD 면제지만, 그 데이터/동작은 인접 repo·컴포넌트 테스트가 RED-first로 덮는다.
- **단일 파일 테스트:** RED/GREEN 확인은 항상 `pnpm test <path-to-test>` (전체 스위트 아님). 전체 그린은 마지막 태스크에서 `pnpm test`.
- **리포지토리 경계 (ESLint 강제):** 모든 DB 접근은 `lib/server/repositories/**`. 라우트·컴포넌트는 `get*Repo()`만 호출. `@/lib/db/schema`·`@/lib/db/client` 값 import 금지(`import type`만 허용). 새 blob 테이블을 `db-boundary-allowlist.mjs`에 추가하지 말 것 — 반드시 `UserAvatarRepo` 경유.
- **버전 floor:** `next@16.2.4`, `react@19.2.4`, `drizzle-orm@0.45.0`. 새 의존성 추가 금지.
- **이미지 제약:** 최대 `5 * 1024 * 1024` 바이트(5MB). MIME는 `image/png`·`image/jpeg`만. `sniffMime`(매직바이트)로 선언 MIME ↔ 실제 바이트 일치 검증. **SVG 금지**(XSS).
- **GET 캐시:** `Cache-Control: private, max-age=31536000, immutable` + `<img src=…?v={avatar_updated_at-ms}>`.
- **DB 변경:** push-only(`pnpm db:push`). 마이그레이션 폴더 없음. PGlite 테스트는 `generateSchemaDDL()`이 스키마 정의에서 DDL을 자동 생성하므로, 스키마 파일에 추가 + `index.ts` export 만으로 테스트에서 새 테이블/컬럼 사용 가능(별도 마이그레이션 불필요). 백필 불필요(기존 유저 `avatar_updated_at=NULL`).
- **factory `BUNDLE_VERSION`:** repo/메서드 추가 시 반드시 +1(HMR 캐시 무효화). 현재 13 → 14로 올린다(Task 1).
- **Linear 디자인:** 폼 라벨은 기존 `WorkspaceLogoForm`의 `font-mono text-[11px] tracking-[0.1em] uppercase` 스타일 재사용. 아바타 이미지는 `rounded-[var(--md-sys-shape-full)]`(원형) + `object-cover`. UX 문구는 해요체(예: "프로필 사진을 변경했어요.").
- **워크트리:** `.claude/worktrees/feat+user-profile-picture` (브랜치 `worktree-feat+user-profile-picture`). `node_modules`는 메인 레포로 심볼릭 링크됨(네이티브 바인딩). 모든 경로는 이 워크트리 기준.
- **커밋 메시지:** 마지막 줄에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 추가.

승인된 스펙: `docs/superpowers/specs/2026-06-20-user-profile-picture-design.md`.

---

### Task 1: `user_avatar_blobs` 저장소 (스키마 + 리포지토리 + factory)

**Files:**
- Create: `lib/db/schema/user-avatar-blobs.ts`
- Modify: `lib/db/schema/index.ts` (workspace-logo-blobs export 다음 줄)
- Modify: `lib/server/repositories/types.ts` (`UserAvatarRepo` 인터페이스 추가)
- Create: `lib/server/repositories/drizzle/user-avatar.ts`
- Modify: `lib/server/repositories/factory.ts` (import·RepoBundle·createRepoBundle·accessor·BUNDLE_VERSION)
- Test: `lib/server/repositories/drizzle/__tests__/user-avatar.test.ts`

**Interfaces:**
- Produces: `userAvatarBlobs` (drizzle table), `UserAvatarRepo` { `find(userId,tx?)→{bytes:Buffer,mime:string}|undefined`, `exists(userId,tx?)→boolean`, `upsert(userId,bytes:Buffer,mime:string,tx?)→void`, `remove(userId,tx?)→void` }, `DrizzleUserAvatarRepository`, `getUserAvatarRepo(): Promise<UserAvatarRepo>`.

- [ ] **Step 1: Write the failing test** — `lib/server/repositories/drizzle/__tests__/user-avatar.test.ts`

```ts
// DrizzleUserAvatarRepository — user avatar bytea blob storage.
//   - find() returns raw bytes + mime (Buffer round-trip through pglite).
//   - exists() is a cheap presence check.
//   - upsert() inserts then overwrites by user_id.
//   - remove() deletes the row.
import { beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleUserAvatarRepository } from '../user-avatar';
import { seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const u = await seedUser(db);
  return { db, repo: new DrizzleUserAvatarRepository(db), userId: u.id };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x20, 0x30]);

describe('DrizzleUserAvatarRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('find() returns undefined when no avatar exists', async () => {
    expect(await ctx.repo.find(ctx.userId)).toBeUndefined();
  });

  it('exists() is false before upsert, true after', async () => {
    expect(await ctx.repo.exists(ctx.userId)).toBe(false);
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    expect(await ctx.repo.exists(ctx.userId)).toBe(true);
  });

  it('upsert() then find() round-trips bytes + mime', async () => {
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    const found = await ctx.repo.find(ctx.userId);
    expect(found?.mime).toBe('image/png');
    expect(Buffer.isBuffer(found?.bytes)).toBe(true);
    expect(found?.bytes.equals(PNG)).toBe(true);
  });

  it('upsert() overwrites an existing avatar (by user_id)', async () => {
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    await ctx.repo.upsert(ctx.userId, JPG, 'image/jpeg');
    const found = await ctx.repo.find(ctx.userId);
    expect(found?.mime).toBe('image/jpeg');
    expect(found?.bytes.equals(JPG)).toBe(true);
  });

  it('remove() deletes the avatar', async () => {
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    await ctx.repo.remove(ctx.userId);
    expect(await ctx.repo.exists(ctx.userId)).toBe(false);
    expect(await ctx.repo.find(ctx.userId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/user-avatar.test.ts`
Expected: FAIL — `Cannot find module '../user-avatar'` (repo not created yet).

- [ ] **Step 3: Create the schema file** — `lib/db/schema/user-avatar-blobs.ts`

```ts
import { pgTable, uuid, text, timestamp, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

const bytea = customType<{
  data: Buffer;
  driverData: Buffer | Uint8Array;
  default: false;
}>({
  dataType() {
    return 'bytea';
  },
  fromDriver(value) {
    return Buffer.from(value as Uint8Array);
  },
});

export const userAvatarBlobs = pgTable('user_avatar_blobs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  bytes: bytea('bytes').notNull(),
  mime: text('mime').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
```

- [ ] **Step 4: Register the table in the schema barrel** — `lib/db/schema/index.ts`

Add directly after the `export * from './workspace-logo-blobs';` line:

```ts
export * from './workspace-logo-blobs';
export * from './user-avatar-blobs';
```

- [ ] **Step 5: Add the `UserAvatarRepo` interface** — `lib/server/repositories/types.ts`

Add immediately after the existing `WorkspaceLogoRepo` interface (around line 1237):

```ts
export interface UserAvatarRepo {
  /** 아바타 바이트+mime — GET /api/user/[id]/avatar. 없으면 undefined. */
  find(
    userId: string,
    tx?: Tx,
  ): Promise<{ bytes: Buffer; mime: string } | undefined>;
  /** 존재 여부만. */
  exists(userId: string, tx?: Tx): Promise<boolean>;
  /** upsert(by user_id). */
  upsert(userId: string, bytes: Buffer, mime: string, tx?: Tx): Promise<void>;
  /** 단건 삭제. */
  remove(userId: string, tx?: Tx): Promise<void>;
}
```

- [ ] **Step 6: Create the repository** — `lib/server/repositories/drizzle/user-avatar.ts`

```ts
import { eq } from 'drizzle-orm';
import { userAvatarBlobs } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { UserAvatarRepo, Tx } from '../types';

export class DrizzleUserAvatarRepository implements UserAvatarRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async find(
    userId: string,
    tx?: Tx,
  ): Promise<{ bytes: Buffer; mime: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ bytes: userAvatarBlobs.bytes, mime: userAvatarBlobs.mime })
      .from(userAvatarBlobs)
      .where(eq(userAvatarBlobs.userId, userId))
      .limit(1);
    if (!row) return undefined;
    // The bytea customType fromDriver already returns a Buffer, but normalise
    // defensively so callers never see a raw Uint8Array.
    return { bytes: Buffer.from(row.bytes), mime: row.mime };
  }

  async exists(userId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .select({ userId: userAvatarBlobs.userId })
      .from(userAvatarBlobs)
      .where(eq(userAvatarBlobs.userId, userId))
      .limit(1);
    return rows.length > 0;
  }

  async upsert(
    userId: string,
    bytes: Buffer,
    mime: string,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(userAvatarBlobs)
      .values({ userId, bytes, mime })
      .onConflictDoUpdate({
        target: userAvatarBlobs.userId,
        set: { bytes, mime, updatedAt: new Date() },
      });
  }

  async remove(userId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(userAvatarBlobs).where(eq(userAvatarBlobs.userId, userId));
  }
}
```

- [ ] **Step 7: Register in factory** — `lib/server/repositories/factory.ts`

(a) Add `UserAvatarRepo,` to the `import type { … } from './types';` block (keep alphabetical-ish next to `UserRepo`):

```ts
  UserRepo,
  UserAvatarRepo,
```

(b) Add to the `RepoBundle` type (next to `workspaceLogo`):

```ts
  workspaceLogo: WorkspaceLogoRepo;
  userAvatar: UserAvatarRepo;
```

(c) Bump the version:

```ts
const BUNDLE_VERSION = 14;
```

(d) In `createRepoBundle`, add the lazy import next to the workspace-logo one:

```ts
  const { DrizzleWorkspaceLogoRepository } = await import('./drizzle/workspace-logo');
  const { DrizzleUserAvatarRepository } = await import('./drizzle/user-avatar');
```

(e) In the `return { … }` object, add next to `workspaceLogo`:

```ts
    workspaceLogo: new DrizzleWorkspaceLogoRepository(db),
    userAvatar: new DrizzleUserAvatarRepository(db),
```

(f) Add the accessor (after `getWorkspaceLogoRepo`):

```ts
export async function getUserAvatarRepo(): Promise<UserAvatarRepo> {
  return (await getBundle()).userAvatar;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/user-avatar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Typecheck + commit**

Run: `pnpm tsc --noEmit` → expect 0 errors.

```bash
git add lib/db/schema/user-avatar-blobs.ts lib/db/schema/index.ts lib/server/repositories/types.ts lib/server/repositories/drizzle/user-avatar.ts lib/server/repositories/factory.ts lib/server/repositories/drizzle/__tests__/user-avatar.test.ts
git commit -m "feat(avatar): user_avatar_blobs storage + UserAvatarRepo + factory"
```

---

### Task 2: `users.avatar_updated_at` + `User.avatarUpdatedAt` + `UserRepo.setAvatarUpdatedAt`

**Files:**
- Modify: `lib/db/schema/users.ts` (add column)
- Modify: `lib/types/user.ts` (add `avatarUpdatedAt`)
- Modify: `lib/server/repositories/types.ts` (add `setAvatarUpdatedAt` to `UserRepo`)
- Modify: `lib/server/repositories/drizzle/user.ts` (`rowToUser` + `setAvatarUpdatedAt`)
- Modify: `lib/server/repositories/drizzle/workspace.ts` (`rowToUser` — keep tsc green for `members[]`)
- Test: `lib/server/repositories/drizzle/__tests__/user.test.ts` (add cases; create file if absent)

**Interfaces:**
- Consumes: `users` table, `DrizzleUserAvatarRepository` (Task 1, for the integration-style assertion is optional).
- Produces: `User.avatarUpdatedAt: string | null` (ISO), `UserRepo.setAvatarUpdatedAt(userId, value: Date | null, tx?) → void`. `findById` now returns `avatarUpdatedAt`.

- [ ] **Step 1: Write the failing test** — append to (or create) `lib/server/repositories/drizzle/__tests__/user.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleUserRepository } from '../user';
import { seedUser } from './_seed';

describe('DrizzleUserRepository.setAvatarUpdatedAt', () => {
  it('findById returns avatarUpdatedAt=null for a fresh user', async () => {
    const db = await createPgliteDb();
    const { id } = await seedUser(db);
    const repo = new DrizzleUserRepository(db);
    const u = await repo.findById(id);
    expect(u?.avatarUpdatedAt).toBeNull();
  });

  it('setAvatarUpdatedAt(Date) is reflected as an ISO string on findById', async () => {
    const db = await createPgliteDb();
    const { id } = await seedUser(db);
    const repo = new DrizzleUserRepository(db);
    await repo.setAvatarUpdatedAt(id, new Date('2026-06-21T00:00:00.000Z'));
    const u = await repo.findById(id);
    expect(u?.avatarUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
  });

  it('setAvatarUpdatedAt(null) clears it back to null', async () => {
    const db = await createPgliteDb();
    const { id } = await seedUser(db);
    const repo = new DrizzleUserRepository(db);
    await repo.setAvatarUpdatedAt(id, new Date());
    await repo.setAvatarUpdatedAt(id, null);
    const u = await repo.findById(id);
    expect(u?.avatarUpdatedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/user.test.ts`
Expected: FAIL — `repo.setAvatarUpdatedAt is not a function` (and/or type error on `avatarUpdatedAt`).

- [ ] **Step 3: Add the column** — `lib/db/schema/users.ts`

Add directly after the `avatarColor` line:

```ts
  avatarColor: text('avatar_color').notNull().default('#000'),
  // 프로필 사진 버전/유무 겸용 — NULL=사진 없음(이니셜), non-NULL=사진 있음 +
  // 그 타임스탬프를 <img> 캐시 버스트 키(?v)로 사용. 업로드 시 now(), 삭제 시 NULL.
  // 바이트는 user_avatar_blobs(분리 테이블). 비정규화(워크스페이스 has_logo 패턴).
  avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
```

- [ ] **Step 4: Add `avatarUpdatedAt` to the `User` type** — `lib/types/user.ts`

```ts
export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: 'lavender' | 'amber' | 'moss' | 'accent' | 'terra' | 'ink';
  /** 프로필 사진 버전 — ISO 문자열이면 사진 있음(=캐시 버스트 키), null이면 이니셜. */
  avatarUpdatedAt: string | null;
  role: Role;
  status: 'active' | 'paused';
  /** Email-verification flag — false until the user consumes a signup_email token. */
  emailVerified: boolean;
  groupId?: string;
  joinedAt: string;
  lastSeenAt?: string;
};
```

- [ ] **Step 5: Add `setAvatarUpdatedAt` to the `UserRepo` interface** — `lib/server/repositories/types.ts`

Add inside `interface UserRepo` (after `setLastActiveWorkspace`):

```ts
  /** 프로필 사진 버전 스탬프 — 업로드 시 now(Date), 삭제 시 null. */
  setAvatarUpdatedAt(userId: string, value: Date | null, tx?: Tx): Promise<void>;
```

- [ ] **Step 6: Implement in the Drizzle user repo** — `lib/server/repositories/drizzle/user.ts`

(a) In `rowToUser`, add the mapping (after `avatarColor`):

```ts
    avatarColor: normAvatar(row.avatarColor),
    avatarUpdatedAt: row.avatarUpdatedAt
      ? new Date(row.avatarUpdatedAt).toISOString()
      : null,
```

(b) Add the method to the `DrizzleUserRepository` class (after `setLastActiveWorkspace`):

```ts
  async setAvatarUpdatedAt(
    userId: string,
    value: Date | null,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(users)
      .set({ avatarUpdatedAt: value })
      .where(eq(users.id, userId));
  }
```

- [ ] **Step 7: Keep `workspace.ts` tsc-green** — `lib/server/repositories/drizzle/workspace.ts`

In `rowToUser(u, m)`, add the mapping (after `avatarColor`). `u` is the full `usersTable` row, so `u.avatarUpdatedAt` exists:

```ts
    avatarColor: normalizeAvatarColor(u.avatarColor),
    avatarUpdatedAt: u.avatarUpdatedAt
      ? new Date(u.avatarUpdatedAt).toISOString()
      : null,
```

- [ ] **Step 8: Run the test + typecheck**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/user.test.ts` → PASS.
Run: `pnpm tsc --noEmit` → expect 0 errors. If tsc flags any OTHER `User` object literal (test factories / fixtures) missing `avatarUpdatedAt`, add `avatarUpdatedAt: null` to each such literal (the value is null wherever a fixture has no avatar). Re-run tsc until 0 errors.

- [ ] **Step 9: Commit**

```bash
git add lib/db/schema/users.ts lib/types/user.ts lib/server/repositories/types.ts lib/server/repositories/drizzle/user.ts lib/server/repositories/drizzle/workspace.ts lib/server/repositories/drizzle/__tests__/user.test.ts
git commit -m "feat(avatar): users.avatar_updated_at + User.avatarUpdatedAt + setAvatarUpdatedAt"
```

---

### Task 3: 쓰기 라우트 `POST/DELETE /api/user/avatar` (본인)

**Files:**
- Create: `app/api/user/avatar/route.ts`
- Test: `app/api/user/avatar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getUserAvatarRepo()`, `getUserRepo().setAvatarUpdatedAt`, `sniffMime`, `isSessionRevoked`, `isEmailUnverified`, `auth`.
- Produces: `POST(req)→Response`, `DELETE()→Response`. POST acts on `session.user.id` (no `[id]` param — ACL is structurally "본인만").

- [ ] **Step 1: Write the failing test** — `app/api/user/avatar/__tests__/route.test.ts`

```ts
/**
 * @vitest-environment node
 */
// POST/DELETE /api/user/avatar — 본인 아바타 업로드/삭제.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { users, userAvatarBlobs } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
  await __useDrizzleWithDbForTest(db);
});

afterEach(async () => {
  __resetForTest();
  vi.resetModules();
});

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);

function makePng(sizeBytes = 100): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  PNG_HEAD.copy(buf);
  return buf;
}
function makeFile(type: string, body: Buffer): File {
  return new File([new Uint8Array(body)], 'avatar.png', { type });
}
async function callPost(form: FormData) {
  const { POST } = await import('../route');
  return POST(new Request('http://localhost/api/user/avatar', { method: 'POST', body: form }));
}
async function callDelete() {
  const { DELETE } = await import('../route');
  return DELETE();
}
function authed(userId: string) {
  sessionRef.value = { user: { id: userId, email: 'x@x.com', sessionVersion: 1 } };
}

it('POST 401 when unauthenticated', async () => {
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(401);
});

it('POST 403 when email not verified', async () => {
  const { id } = await seedUser(db);
  authed(id);
  getDbEmailVerifiedMock.mockResolvedValue(false);
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(403);
});

it('POST 401 when session version is stale', async () => {
  const { id } = await seedUser(db);
  authed(id);
  getDbSessionVersionMock.mockResolvedValue(2);
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(401);
});

it('POST 400 when no file', async () => {
  const { id } = await seedUser(db);
  authed(id);
  expect((await callPost(new FormData())).status).toBe(400);
});

it('POST 413 when file exceeds 5MB', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const big = Buffer.alloc(5 * 1024 * 1024 + 1);
  PNG_HEAD.copy(big);
  const form = new FormData();
  form.append('file', makeFile('image/png', big));
  expect((await callPost(form)).status).toBe(413);
});

it('POST 415 when mime not allowed', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const form = new FormData();
  form.append('file', makeFile('application/pdf', Buffer.from([0x25, 0x50, 0x44, 0x46])));
  expect((await callPost(form)).status).toBe(415);
});

it('POST 415 when magic bytes mismatch stated mime', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const form = new FormData();
  form.append('file', makeFile('image/png', JPEG_HEAD));
  expect((await callPost(form)).status).toBe(415);
});

it('POST upserts blob and stamps avatar_updated_at', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(200);

  const [blob] = await db.select().from(userAvatarBlobs).where(eq(userAvatarBlobs.userId, id));
  expect(blob?.mime).toBe('image/png');
  const [u] = await db.select({ at: users.avatarUpdatedAt }).from(users).where(eq(users.id, id));
  expect(u.at).not.toBeNull();
});

it('DELETE 401 when unauthenticated', async () => {
  expect((await callDelete()).status).toBe(401);
});

it('DELETE removes blob and clears avatar_updated_at', async () => {
  const { id } = await seedUser(db);
  await db.insert(userAvatarBlobs).values({ userId: id, bytes: makePng(), mime: 'image/png' });
  await db.update(users).set({ avatarUpdatedAt: new Date() }).where(eq(users.id, id));
  authed(id);
  expect((await callDelete()).status).toBe(200);
  const rows = await db.select().from(userAvatarBlobs).where(eq(userAvatarBlobs.userId, id));
  expect(rows).toHaveLength(0);
  const [u] = await db.select({ at: users.avatarUpdatedAt }).from(users).where(eq(users.id, id));
  expect(u.at).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/api/user/avatar/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement the route** — `app/api/user/avatar/route.ts`

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getUserAvatarRepo, getUserRepo } from '@/lib/server/repositories/factory';
import { sniffMime } from '@/lib/server/storage/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
// SVG는 의도적으로 제외(워크스페이스 로고와 동일한 XSS 사유).
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');
  const userId = session.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'INVALID_MULTIPART');
  }

  const rawFile = form.get('file');
  if (!(rawFile instanceof File)) return fail(400, 'FILE_REQUIRED');
  if (rawFile.size <= 0) return fail(400, 'EMPTY_FILE');
  if (rawFile.size > MAX_BYTES) return fail(413, 'FILE_TOO_LARGE');
  if (!ALLOWED_MIMES.has(rawFile.type)) return fail(415, 'MIME_NOT_ALLOWED');

  const buffer = Buffer.from(await rawFile.arrayBuffer());
  const sniffed = sniffMime(buffer);
  if (!sniffed || sniffed !== rawFile.type) return fail(415, 'MIME_MISMATCH');

  await (await getUserAvatarRepo()).upsert(userId, buffer, sniffed);
  await (await getUserRepo()).setAvatarUpdatedAt(userId, new Date());

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');
  const userId = session.user.id;

  await (await getUserAvatarRepo()).remove(userId);
  await (await getUserRepo()).setAvatarUpdatedAt(userId, null);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/api/user/avatar/__tests__/route.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/user/avatar/route.ts app/api/user/avatar/__tests__/route.test.ts
git commit -m "feat(avatar): POST/DELETE /api/user/avatar (self upload/delete)"
```

---

### Task 4: 서빙 라우트 `GET /api/user/[id]/avatar` (로그인 필수)

**Files:**
- Create: `app/api/user/[id]/avatar/route.ts`
- Test: `app/api/user/[id]/avatar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getUserAvatarRepo().find`, `auth`.
- Produces: `GET(req, ctx: { params: Promise<{ id: string }> })→Response`. 401 if no session, 404 if no avatar, else bytes + `private, immutable` cache.

- [ ] **Step 1: Write the failing test** — `app/api/user/[id]/avatar/__tests__/route.test.ts`

```ts
/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { userAvatarBlobs } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));

let db: PgliteDB;
beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  sessionRef.value = null;
  await __useDrizzleWithDbForTest(db);
});
afterEach(async () => {
  __resetForTest();
  vi.resetModules();
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function callGet(id: string) {
  const { GET } = await import('../route');
  return GET(new Request(`http://localhost/api/user/${id}/avatar`), {
    params: Promise.resolve({ id }),
  });
}
function authed() {
  sessionRef.value = { user: { id: 'viewer-1', email: 'v@v.com' } };
}

it('GET 401 when unauthenticated', async () => {
  const { id } = await seedUser(db);
  expect((await callGet(id)).status).toBe(401);
});

it('GET 404 when user has no avatar', async () => {
  const { id } = await seedUser(db);
  authed();
  expect((await callGet(id)).status).toBe(404);
});

it('GET returns bytes + private immutable cache header', async () => {
  const { id } = await seedUser(db);
  await db.insert(userAvatarBlobs).values({ userId: id, bytes: PNG, mime: 'image/png' });
  authed();
  const res = await callGet(id);
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('image/png');
  expect(res.headers.get('Cache-Control')).toContain('private');
  expect(res.headers.get('Cache-Control')).toContain('immutable');
  const body = Buffer.from(await res.arrayBuffer());
  expect(body).toEqual(PNG);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/api/user/[id]/avatar/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Implement the route** — `app/api/user/[id]/avatar/route.ts`

```ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { getUserAvatarRepo } from '@/lib/server/repositories/factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  // 개인 사진 — 로그인 세션 필수(워크스페이스 로고의 공개 GET과 다름).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await (await getUserAvatarRepo()).find(id);
  if (!row) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  // Copy into a plain ArrayBuffer-backed view so the bytes satisfy BodyInit.
  const body = new Uint8Array(row.bytes);
  return new Response(body, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(body.length),
      // URL carries ?v={avatar_updated_at} → version change = new URL = fresh fetch.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/api/user/[id]/avatar/__tests__/route.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/user/[id]/avatar/route.ts" "app/api/user/[id]/avatar/__tests__/route.test.ts"
git commit -m "feat(avatar): GET /api/user/[id]/avatar (auth-gated, immutable cache)"
```

---

### Task 5: `Avatar` 컴포넌트 — 이미지 지원 + 이니셜 폴백

**Files:**
- Modify: `components/primitives/Avatar.tsx` (`'use client'` 전환 + props)
- Test: `components/primitives/__tests__/Avatar.test.tsx`

**Interfaces:**
- Produces: `Avatar` accepts optional `userId?: string` + `avatarUpdatedAt?: string | null`. When both truthy → `<img src="/api/user/{userId}/avatar?v={ms}">` with initials fallback on error. Otherwise unchanged initials. Backward compatible (existing call sites pass only `name`).

- [ ] **Step 1: Write the failing test** — `components/primitives/__tests__/Avatar.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from '../Avatar';

afterEach(() => cleanup());

describe('Avatar', () => {
  it('renders initials when no userId/avatarUpdatedAt', () => {
    render(<Avatar name="홍 길동" />);
    expect(screen.getByLabelText('홍 길동')).toHaveTextContent('홍길');
  });

  it('renders initials when avatarUpdatedAt is null even with userId', () => {
    render(<Avatar name="Acme" userId="u-1" avatarUpdatedAt={null} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders <img> with cache-bust ?v when userId + avatarUpdatedAt present', () => {
    render(<Avatar name="Acme" userId="u-1" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    const ms = Date.parse('2026-06-21T00:00:00.000Z');
    expect(img).toHaveAttribute('src', `/api/user/u-1/avatar?v=${ms}`);
    expect(img).toHaveAttribute('alt', 'Acme');
  });

  it('falls back to initials when img onError fires', () => {
    render(<Avatar name="Acme Corp" userId="u-1" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText('Acme Corp')).toHaveTextContent('AC');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/primitives/__tests__/Avatar.test.tsx`
Expected: FAIL — no `<img>` rendered (Avatar ignores `userId`/`avatarUpdatedAt`).

- [ ] **Step 3: Implement** — replace `components/primitives/Avatar.tsx` entirely

```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type AvatarColor = 'primary' | 'secondary' | 'tertiary' | 'error' | 'surface';
type AvatarSize = 'sm' | 'md' | 'lg';

const colorMap: Record<AvatarColor, string> = {
  primary:   'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]',
  secondary: 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]',
  tertiary:  'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]',
  error:     'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]',
  surface:   'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]',
};

const sizeMap: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-[length:var(--md-typescale-label-small-size)]',
  md: 'w-8 h-8 text-[length:var(--md-typescale-label-large-size)]',
  lg: 'w-10 h-10 text-[length:var(--md-typescale-title-small-size)]',
};

const imgSizeMap: Record<AvatarSize, string> = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

type AvatarProps = {
  name: string;
  color?: AvatarColor;
  size?: AvatarSize;
  className?: string;
  /** 사용자 id — avatarUpdatedAt 과 함께 있으면 사진을 렌더한다. */
  userId?: string;
  /** 프로필 사진 버전(ISO). null/undefined 면 이니셜. 있으면 ?v 캐시 버스트 키. */
  avatarUpdatedAt?: string | null;
};

export function Avatar({ name, color = 'primary', size = 'md', className, userId, avatarUpdatedAt }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (userId && avatarUpdatedAt && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bytes served from our own API route; no external domain needed
      <img
        src={`/api/user/${userId}/avatar?v=${Date.parse(avatarUpdatedAt)}`}
        alt={name}
        onError={() => setImgError(true)}
        className={cn(
          'inline-block shrink-0 object-cover rounded-[var(--md-sys-shape-full)]',
          imgSizeMap[size],
          className,
        )}
      />
    );
  }

  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--md-sys-shape-full)]',
        'font-[number:var(--md-typescale-label-large-weight)] select-none',
        colorMap[color],
        sizeMap[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/primitives/__tests__/Avatar.test.tsx` → PASS.

- [ ] **Step 5: Guard against an `Avatar`-in-server-only regression**

Run: `pnpm tsc --noEmit` → 0 errors. Then sanity-check no email template imports it (would break under `'use client'`):
Run: `grep -rn "primitives/Avatar" emails/ lib/integrations/ 2>/dev/null || echo "none"` → expect `none`.

- [ ] **Step 6: Commit**

```bash
git add components/primitives/Avatar.tsx components/primitives/__tests__/Avatar.test.tsx
git commit -m "feat(avatar): Avatar renders user photo (img + ?v) with initials fallback"
```

---

### Task 6: 설정 페이지 업로드 폼 `UserAvatarForm`

**Files:**
- Create: `components/settings/UserAvatarForm.tsx`
- Modify: `app/(app)/settings/profile/page.tsx` (사용자 섹션)
- Test: `components/settings/__tests__/UserAvatarForm.test.tsx`

**Interfaces:**
- Consumes: `Avatar` (Task 5), `POST/DELETE /api/user/avatar` (Task 3).
- Produces: `UserAvatarForm({ userId, name, avatarUpdatedAt })`. Upload → `POST /api/user/avatar` (FormData `file`); delete (only when `avatarUpdatedAt != null`) → `DELETE /api/user/avatar`; `router.refresh()` on success.

- [ ] **Step 1: Write the failing test** — `components/settings/__tests__/UserAvatarForm.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));
const refresh = vi.fn();
const fetchMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  global.fetch = fetchMock;
  toast.mockReset();
  fetchMock.mockReset();
  refresh.mockReset();
});
afterEach(() => cleanup());

import { UserAvatarForm } from '../UserAvatarForm';

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function makePngFile(): File {
  const buf = new Uint8Array(100);
  buf.set(PNG_HEAD);
  return new File([buf], 'avatar.png', { type: 'image/png' });
}

describe('UserAvatarForm', () => {
  it('renders 사진 변경 button', () => {
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt={null} />);
    expect(screen.getByRole('button', { name: '사진 변경' })).toBeInTheDocument();
  });

  it('does not render 삭제 button when avatarUpdatedAt is null', () => {
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt={null} />);
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('renders 삭제 button when avatarUpdatedAt is set', () => {
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('POSTs to /api/user/avatar on valid file, then refreshes', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt={null} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makePngFile());
    expect(fetchMock).toHaveBeenCalledWith('/api/user/avatar', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('DELETEs to /api/user/avatar when 삭제 clicked', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/user/avatar', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/settings/__tests__/UserAvatarForm.test.tsx`
Expected: FAIL — `Cannot find module '../UserAvatarForm'`.

- [ ] **Step 3: Implement** — `components/settings/UserAvatarForm.tsx`

```tsx
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/primitives/Avatar';
import { toast } from '@/lib/toast';

type Props = { userId: string; name: string; avatarUpdatedAt: string | null };

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);

export function UserAvatarForm({ userId, name, avatarUpdatedAt }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<'upload' | 'delete' | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      toast('PNG 또는 JPEG 파일을 업로드해요.', { type: 'error' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast('5MB 이하 파일을 올려요.', { type: 'error' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    setLoading('upload');
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: form });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast(json.error ?? '업로드에 실패했어요.', { type: 'error' });
        return;
      }
      toast('프로필 사진을 변경했어요.');
      router.refresh();
    } finally {
      setLoading(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete() {
    setLoading('delete');
    try {
      const res = await fetch('/api/user/avatar', { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast(json.error ?? '삭제에 실패했어요.', { type: 'error' });
        return;
      }
      toast('프로필 사진을 삭제했어요.');
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} userId={userId} avatarUpdatedAt={avatarUpdatedAt} color="primary" size="lg" />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleFileChange}
      />
      {loading === 'upload' ? (
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          업로드 중…
        </span>
      ) : loading === 'delete' ? (
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          삭제 중…
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-extra-small)] px-2.5 py-1 hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
          >
            사진 변경
          </button>
          {avatarUpdatedAt != null && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-[12px] text-[var(--md-sys-color-error)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-extra-small)] px-2.5 py-1 hover:bg-[var(--md-sys-color-error-container)] transition-colors"
            >
              삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire into the settings page** — `app/(app)/settings/profile/page.tsx`

(a) Add the import next to the other settings form imports:

```ts
import { UserAvatarForm } from '@/components/settings/UserAvatarForm';
```

(b) Replace the read-only user block (the `{/* User profile (read-only for now …) */}` comment through its avatar+name/email `<div className="flex items-center gap-4 mb-3">…</div>`) with:

```tsx
      {/* User profile — 프로필 사진 업로드/삭제 가능 */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>사용자</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="flex items-center gap-4 mb-3">
          <UserAvatarForm userId={me.id} name={me.name} avatarUpdatedAt={me.avatarUpdatedAt} />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">{me.name}</p>
            <p className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] break-all">
              {me.email}
            </p>
          </div>
        </div>
```

(Leave the existing `divide-y … 가입일` block and the rest of the section unchanged. The static `<Avatar>` import in this page may now be unused — if `pnpm lint` flags `Avatar` as unused, remove its import line.)

- [ ] **Step 5: Run test + lint + typecheck**

Run: `pnpm test components/settings/__tests__/UserAvatarForm.test.tsx` → PASS.
Run: `pnpm tsc --noEmit` and `pnpm lint` → 0 errors (remove the now-unused `Avatar` import in profile page if lint flags it).

- [ ] **Step 6: Commit**

```bash
git add components/settings/UserAvatarForm.tsx "app/(app)/settings/profile/page.tsx" components/settings/__tests__/UserAvatarForm.test.tsx
git commit -m "feat(avatar): UserAvatarForm in settings/profile (upload/delete)"
```

---

### Task 7: 셸(헤더/사이드바 유저 메뉴) 배선

**Files:**
- Modify: `app/(app)/layout.tsx` (현재 유저 `avatarUpdatedAt` 서버 로드 + prop)
- Modify: `components/shell/AppSidebarLayout.tsx` (`header.user` 타입)
- Modify: `components/shell/Header.tsx` (props 타입)
- Modify: `components/shell/UserMenu.tsx` (props 타입 + `Avatar` render)
- Modify: `components/shell/Sidebar.tsx` (`SidebarProps.user` + 모바일 `UserMenu` 호출)
- Test: `components/shell/__tests__/UserMenu.test.tsx`

**Interfaces:**
- Consumes: `getUserRepo().findById` (Task 2), `Avatar` (Task 5).
- Produces: `UserMenu` props gain `user.id: string` + `user.avatarUpdatedAt: string | null`; renders the trigger `<Avatar>` with them.

- [ ] **Step 1: Write the failing test** — `components/shell/__tests__/UserMenu.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { UserMenu } from '../UserMenu';

afterEach(() => cleanup());

describe('UserMenu avatar', () => {
  it('renders the user photo in the trigger when avatarUpdatedAt is set', () => {
    render(
      <UserMenu
        user={{ id: 'u-9', name: '김담당', email: 'k@k.com', avatarUpdatedAt: '2026-06-21T00:00:00.000Z' }}
        workspaceType="buyer"
      />,
    );
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', `/api/user/u-9/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
  });

  it('renders initials when avatarUpdatedAt is null', () => {
    render(
      <UserMenu
        user={{ id: 'u-9', name: '김담당', email: 'k@k.com', avatarUpdatedAt: null }}
        workspaceType="buyer"
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/shell/__tests__/UserMenu.test.tsx`
Expected: FAIL — TS/runtime error: `user` prop has no `id`/`avatarUpdatedAt`; no `<img>` rendered.

- [ ] **Step 3: Update `UserMenu`** — `components/shell/UserMenu.tsx`

(a) Props type:

```ts
type UserMenuProps = {
  user: { id: string; name: string; email: string; avatarUpdatedAt: string | null };
  workspaceType: WorkspaceType;
  className?: string;
};
```

(b) The trigger `<Avatar>`:

```tsx
        <Avatar
          name={user.name}
          color="surface"
          size="sm"
          userId={user.id}
          avatarUpdatedAt={user.avatarUpdatedAt}
          className="cursor-pointer"
        />
```

- [ ] **Step 4: Update `Header`** — `components/shell/Header.tsx`

```ts
type HeaderProps = {
  user: { id: string; name: string; email: string; avatarUpdatedAt: string | null };
  workspaceType: WorkspaceType;
  className?: string;
};
```

(The `<UserMenu user={user} … />` call already forwards the whole object — no change there.)

- [ ] **Step 5: Update `AppSidebarLayout`** — `components/shell/AppSidebarLayout.tsx`

```ts
  header?: {
    user: { id: string; name: string; email: string; avatarUpdatedAt: string | null };
    workspaceType: WorkspaceType;
    className?: string;
  };
```

- [ ] **Step 6: Update `Sidebar`** — `components/shell/Sidebar.tsx`

(a) `SidebarProps.user`:

```ts
  user: { id: string; email: string; name: string; avatarUpdatedAt: string | null };
```

(b) The mobile `UserMenu` call inside `SidebarBody` — forward the new fields:

```tsx
          <UserMenu
            user={{ id: user.id, name: user.name, email: user.email, avatarUpdatedAt: user.avatarUpdatedAt }}
            workspaceType={workspaceType}
          />
```

- [ ] **Step 7: Load `avatarUpdatedAt` in the layout** — `app/(app)/layout.tsx`

(a) Ensure `getUserRepo` is imported from the factory (add to the existing factory import, or add a new import):

```ts
import { getUserRepo } from '@/lib/server/repositories/factory';
```

(b) After `const user = session!.user!;`, load the avatar version from the DB (NOT the JWT — keeps `?v` fresh after upload):

```ts
  const user = session!.user!;
  const me = await (await getUserRepo()).findById(user.id);
  const avatarUpdatedAt = me?.avatarUpdatedAt ?? null;
```

(c) In the `sidebar` prop object, add `avatarUpdatedAt` to `user`:

```ts
          user: {
            id: user.id,
            email: user.email,
            name: user.name ?? user.email,
            avatarUpdatedAt,
          },
```

(d) In the `header` prop object, add `id` + `avatarUpdatedAt`:

```ts
        header={{
          user: {
            id: user.id,
            name: user.name ?? user.email,
            email: user.email,
            avatarUpdatedAt,
          },
          workspaceType: active.type,
        }}
```

- [ ] **Step 8: Run test + typecheck**

Run: `pnpm test components/shell/__tests__/UserMenu.test.tsx` → PASS.
Run: `pnpm tsc --noEmit` → 0 errors (the new required fields force every caller updated above).

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/layout.tsx" components/shell/AppSidebarLayout.tsx components/shell/Header.tsx components/shell/UserMenu.tsx components/shell/Sidebar.tsx components/shell/__tests__/UserMenu.test.tsx
git commit -m "feat(avatar): show user photo in header/sidebar user menu"
```

---

### Task 8: 멤버 목록(`MemberRow`) 배선

**Files:**
- Modify: `components/settings/MemberRow.tsx` (`Avatar` render)
- Test: `components/settings/__tests__/MemberRow.test.tsx`

**Interfaces:**
- Consumes: `User.avatarUpdatedAt` (Task 2 — already populated through `workspace.ts rowToUser` → `ws.members[]`).
- Produces: member avatar shows the photo.

- [ ] **Step 1: Write the failing test** — `components/settings/__tests__/MemberRow.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemberRow } from '../MemberRow';
import type { User } from '@/lib/types/user';

afterEach(() => cleanup());

const member: User = {
  id: 'u-7',
  name: '이멤버',
  email: 'm@m.com',
  avatarColor: 'ink',
  avatarUpdatedAt: '2026-06-21T00:00:00.000Z',
  role: 'member',
  status: 'active',
  emailVerified: true,
  joinedAt: '2026-06-01T00:00:00.000Z',
};

it('renders the member photo when avatarUpdatedAt is set', () => {
  render(
    <MemberRow
      member={member}
      isSelf={false}
      isAdmin={false}
      isMutating={false}
      onRoleChange={vi.fn()}
      onRemoveClick={vi.fn()}
    />,
  );
  const img = screen.getByRole('img');
  expect(img.tagName).toBe('IMG');
  expect(img).toHaveAttribute('src', `/api/user/u-7/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/settings/__tests__/MemberRow.test.tsx`
Expected: FAIL — no `<img>` (MemberRow's `<Avatar>` ignores avatar fields).

- [ ] **Step 3: Implement** — `components/settings/MemberRow.tsx`

Change the `<Avatar>` line:

```tsx
      <Avatar name={m.name} color="primary" size="md" userId={m.id} avatarUpdatedAt={m.avatarUpdatedAt} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/settings/__tests__/MemberRow.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/settings/MemberRow.tsx components/settings/__tests__/MemberRow.test.tsx
git commit -m "feat(avatar): show member photo in members list"
```

---

### Task 9: 팀 로스터 + 멘션 드롭다운 배선

**Files:**
- Modify: `lib/server/repositories/types.ts` (`TeamMember` 타입)
- Modify: `lib/server/repositories/drizzle/workspace.ts` (`teamRoster` select)
- Modify: `lib/server/actions/chat/teamThreadLoader.ts` (`LoadTeamThreadResult.teamMembers` inline 타입)
- Modify: `components/messages/mention-input.ts` (`MentionCandidate` + `MentionItem`)
- Modify: the Candidate→Item mapper (locate, see Step 5)
- Modify: `components/messages/MentionDropdown.tsx` (`Avatar` render)
- Test: `lib/server/repositories/drizzle/__tests__/workspace-teamRoster.test.ts`, `components/messages/__tests__/MentionDropdown.test.tsx`

**Interfaces:**
- Produces: `TeamMember` + `MentionCandidate` + `MentionItem.member` gain `avatarUpdatedAt: string | null`. Mention dropdown rows show the member photo.

- [ ] **Step 1: Write the failing repo test** — `lib/server/repositories/drizzle/__tests__/workspace-teamRoster.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedUser, seedBuyerWorkspace, seedMembership } from './_seed';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('teamRoster avatarUpdatedAt', () => {
  it('includes avatarUpdatedAt (ISO) for members with an avatar, null otherwise', async () => {
    const db = await createPgliteDb();
    const { id: wsId } = await seedBuyerWorkspace(db);
    const { id: withAvatar } = await seedUser(db, { name: 'A' });
    const { id: without } = await seedUser(db, { name: 'B' });
    await seedMembership(db, wsId, withAvatar);
    await seedMembership(db, wsId, without);
    await db.update(users).set({ avatarUpdatedAt: new Date('2026-06-21T00:00:00.000Z') }).where(eq(users.id, withAvatar));

    const repo = new DrizzleWorkspaceRepository(db);
    const roster = await repo.teamRoster(wsId);
    const a = roster.find((r) => r.userId === withAvatar);
    const b = roster.find((r) => r.userId === without);
    expect(a?.avatarUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
    expect(b?.avatarUpdatedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/workspace-teamRoster.test.ts`
Expected: FAIL — `avatarUpdatedAt` undefined / type error.

- [ ] **Step 3: Extend `TeamMember`** — `lib/server/repositories/types.ts`

```ts
export type TeamMember = { userId: string; name: string; joinedAt: string; avatarUpdatedAt: string | null };
```

- [ ] **Step 4: Extend `teamRoster`** — `lib/server/repositories/drizzle/workspace.ts`

(a) Add the column to the `.select({…})`:

```ts
      .select({
        userId: workspaceMembers.userId,
        name: usersTable.name,
        joinedAt: workspaceMembers.joinedAt,
        avatarUpdatedAt: usersTable.avatarUpdatedAt,
      })
```

(b) Widen the row cast and the map:

```ts
      .orderBy(asc(workspaceMembers.joinedAt))) as {
      userId: string;
      name: string;
      joinedAt: Date;
      avatarUpdatedAt: Date | null;
    }[];
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      joinedAt: new Date(r.joinedAt).toISOString(),
      avatarUpdatedAt: r.avatarUpdatedAt ? new Date(r.avatarUpdatedAt).toISOString() : null,
    }));
```

- [ ] **Step 5: Thread the field through the loader + mention types**

(a) `lib/server/actions/chat/teamThreadLoader.ts` — update the `teamMembers` inline type in `LoadTeamThreadResult`:

```ts
  teamMembers: { userId: string; name: string; joinedAt: string; avatarUpdatedAt: string | null }[];
```

(The `loadTeamThread` body already assigns `membersResult.members` directly, which now carry `avatarUpdatedAt` — no map change needed.)

(b) `components/messages/mention-input.ts`:

```ts
export type MentionCandidate = { userId: string; name: string; joinedAt: string; avatarUpdatedAt: string | null };

export type MentionItem =
  | { kind: 'all' }
  | { kind: 'member'; userId: string; name: string; joinedAt: string; avatarUpdatedAt: string | null };
```

(c) Locate the Candidate→Item mapper and forward the field:

Run: `grep -rn "kind: 'member'" components/messages` → open the file that builds the member `MentionItem` from a `MentionCandidate` (e.g. a `useMentionPicker`/`mention-input` helper) and add `avatarUpdatedAt: c.avatarUpdatedAt` to that object literal (mirror the existing `userId`/`name`/`joinedAt` copy; the candidate variable name may differ — match the local).

- [ ] **Step 6: Render the photo in the dropdown** — `components/messages/MentionDropdown.tsx`

Change the member-branch `<Avatar>`:

```tsx
                <Avatar name={item.name} size="sm" color="surface" userId={item.userId} avatarUpdatedAt={item.avatarUpdatedAt} />
```

- [ ] **Step 7: Write the dropdown render test** — `components/messages/__tests__/MentionDropdown.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MentionDropdown } from '../MentionDropdown';
import type { MentionItem } from '../mention-input';

afterEach(() => cleanup());

it('renders a member photo for a member item with avatarUpdatedAt', () => {
  const items: MentionItem[] = [
    { kind: 'member', userId: 'u-3', name: '박멘션', joinedAt: '2026-06-01T00:00:00.000Z', avatarUpdatedAt: '2026-06-21T00:00:00.000Z' },
  ];
  render(<MentionDropdown items={items} activeIndex={0} duplicateNames={new Set()} onPick={vi.fn()} onHover={vi.fn()} />);
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('src', `/api/user/u-3/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
});
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/workspace-teamRoster.test.ts components/messages/__tests__/MentionDropdown.test.tsx` → PASS.
Run: `pnpm tsc --noEmit` → 0 errors (the required `avatarUpdatedAt` on `TeamMember`/`MentionCandidate` forces the mapper in Step 5c; if tsc still flags a missing field, that is the mapper site — fix it).

- [ ] **Step 9: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/workspace.ts lib/server/actions/chat/teamThreadLoader.ts components/messages/mention-input.ts components/messages/MentionDropdown.tsx lib/server/repositories/drizzle/__tests__/workspace-teamRoster.test.ts components/messages/__tests__/MentionDropdown.test.tsx
# include the mapper file from Step 5c if it is a separate file
git commit -m "feat(avatar): show member photos in team roster + mention dropdown"
```

---

### Task 10: 1:1 (상대방) 채팅 발신자 아바타

**Files:**
- Modify: `lib/server/repositories/types.ts` (`ChatMessageWithAuthor`)
- Modify: `lib/server/repositories/drizzle/chat-message.ts` (`listByConversationWithAuthor` select)
- Modify: `lib/server/actions/chat/conversationLoaders.ts` (`ThreadMessage` + `LoadThreadResult.viewer` + map)
- Modify: `lib/server/actions/chat/sendChatMessageAction.ts` (publish payload)
- Modify: `components/messages/ThreadView.tsx` (`viewer` prop, `LiveMessagePayload`, onMessage, optimistic, `<Avatar>` render)
- Test: `lib/server/actions/chat/__tests__/conversationLoaders.test.ts` (add a case)

**Interfaces:**
- Consumes: `users.avatarUpdatedAt`, `getUserRepo().findById`, `Avatar`.
- Produces: `ThreadMessage.authorAvatarUpdatedAt: string | null`; `LoadThreadResult.viewer.avatarUpdatedAt: string | null`; published live payload field `authorAvatarUpdatedAt`.

- [ ] **Step 1: Write the failing test** — add to `lib/server/actions/chat/__tests__/conversationLoaders.test.ts`

(Open the existing test file; mirror its existing setup for a conversation with one message. Add:)

```ts
it('ThreadMessage carries authorAvatarUpdatedAt from the users join', async () => {
  // ... reuse the file's helpers to seed a buyer ws, pg ws, conversation,
  // a sender user with an avatar_updated_at, and one message from them ...
  // await db.update(users).set({ avatarUpdatedAt: new Date('2026-06-21T00:00:00.000Z') }).where(eq(users.id, senderId));
  const res = await loadConversationThread(conversationId);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.messages[0].authorAvatarUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
    expect(res.viewer).toHaveProperty('avatarUpdatedAt');
  }
});
```

(If the file lacks reusable seed helpers, follow its existing `beforeEach`/setup pattern verbatim and add the `users` + `eq` imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/actions/chat/__tests__/conversationLoaders.test.ts`
Expected: FAIL — `authorAvatarUpdatedAt` undefined.

- [ ] **Step 3: Extend the repo projection** — `lib/server/repositories/drizzle/chat-message.ts`

(a) `ChatMessageWithAuthor` in `types.ts`:

```ts
export type ChatMessageWithAuthor = ChatMessageRecord & {
  authorName: string;
  authorEmail: string;
  authorAvatarUpdatedAt: Date | null;
};
```

(b) `listByConversationWithAuthor` select — add the joined column:

```ts
      .select({
        ...MESSAGE_COLUMNS,
        authorName: users.name,
        authorEmail: users.email,
        authorAvatarUpdatedAt: users.avatarUpdatedAt,
      })
```

- [ ] **Step 4: Extend the loader** — `lib/server/actions/chat/conversationLoaders.ts`

(a) `ThreadMessage` type — add:

```ts
  /** 작성자 프로필 사진 버전(users.avatar_updated_at, ISO) — 말풍선 아바타. */
  authorAvatarUpdatedAt: string | null;
```

(b) `LoadThreadResult.viewer` type — add `avatarUpdatedAt`:

```ts
  viewer: { userId: string; name: string; avatarUpdatedAt: string | null };
```

(c) In the `messages` map, add the field:

```ts
      authorAvatarUpdatedAt: m.authorAvatarUpdatedAt
        ? new Date(m.authorAvatarUpdatedAt).toISOString()
        : null,
```

(d) The `viewer` return — `viewerUser` is already loaded via `userRepo.findById(ws.userId)`:

```ts
    viewer: { userId: ws.userId, name: viewerUser?.name ?? '', avatarUpdatedAt: viewerUser?.avatarUpdatedAt ?? null },
```

- [ ] **Step 5: Publish the field live** — `lib/server/actions/chat/sendChatMessageAction.ts`

Inside the `if (result.ok) { … }` block, before `publishChatEvent`, load the author's avatar version, then add it to the payload:

```ts
    const author = await (await getUserRepo()).findById(ws.userId);
    await publishChatEvent(result.conversationId, {
      type: 'message',
      id: result.messageId,
      body: data.body.trim(),
      authorWsId: ws.workspaceId,
      authorUserId: ws.userId,
      authorName: result.authorName,
      authorEmail: result.authorEmail,
      authorAvatarUpdatedAt: author?.avatarUpdatedAt ?? null,
      rfpId: result.rfpId,
      tempId: data.tempId ?? null,
      createdAt: result.createdAt,
      attachments: savedAtts.map(({ chatMessageId: _cid, ...att }) => att),
    });
```

Add `getUserRepo` to the existing factory import at the top of the file:

```ts
import { getAttachmentRepo, getUserRepo } from '@/lib/server/repositories/factory';
```

- [ ] **Step 6: Wire the client** — `components/messages/ThreadView.tsx`

(a) `Props.viewer`:

```ts
  viewer: { userId: string; name: string; avatarUpdatedAt: string | null };
```

(b) `LiveMessagePayload` — add:

```ts
  authorAvatarUpdatedAt?: string | null;
```

(c) In the `onMessage` live-append fallback object, add:

```ts
              authorUserId: data.authorUserId ?? '',
              authorName: data.authorName ?? '',
              authorEmail: data.authorEmail ?? '',
              authorAvatarUpdatedAt: data.authorAvatarUpdatedAt ?? null,
```

(d) The author-header `<Avatar>`:

```tsx
                    <Avatar name={m.authorName} size="sm" color={isSelf ? 'primary' : 'surface'} userId={m.authorUserId} avatarUpdatedAt={m.authorAvatarUpdatedAt} />
```

(e) Optimistic self bubble: `grep -n "pending: true" components/messages/ThreadView.tsx` to find where `handleSend` builds the optimistic `LocalMessage`. Add `authorAvatarUpdatedAt: viewer.avatarUpdatedAt` to that object (mirrors the onMessage shape; the sender's own version).

- [ ] **Step 7: Run test + typecheck**

Run: `pnpm test lib/server/actions/chat/__tests__/conversationLoaders.test.ts` → PASS.
Run: `pnpm tsc --noEmit` → 0 errors (required `authorAvatarUpdatedAt`/`viewer.avatarUpdatedAt` force all the call sites above — fix any the compiler flags, including the page that renders `<ThreadView viewer={…}>`, by passing `loadConversationThread`'s `viewer` straight through).

- [ ] **Step 8: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/chat-message.ts lib/server/actions/chat/conversationLoaders.ts lib/server/actions/chat/sendChatMessageAction.ts components/messages/ThreadView.tsx lib/server/actions/chat/__tests__/conversationLoaders.test.ts
git commit -m "feat(avatar): 1:1 chat sender photos (static + live)"
```

---

### Task 11: 팀 채팅 발신자 아바타

**Files:**
- Modify: `lib/server/repositories/types.ts` (`RfpTeamMessageWithAuthor`)
- Modify: `lib/server/repositories/drizzle/rfp-team-message.ts` (`TEAM_MESSAGE_COLUMNS`)
- Modify: `lib/server/actions/chat/teamThreadLoader.ts` (`TeamThreadMessage` + `LoadTeamThreadResult` + map)
- Modify: `lib/server/actions/chat/sendTeamMessageAction.ts` (publish payload)
- Modify: `lib/hooks/useTeamChannel.ts` (`TeamLivePayload`)
- Modify: `components/messages/TeamThreadView.tsx` (`viewerAvatarUpdatedAt` prop, onMessage, optimistic, `<Avatar>` render)
- Test: `lib/server/actions/chat/__tests__/teamThreadLoader.test.ts` (add a case)

**Interfaces:**
- Produces: `RfpTeamMessageWithAuthor.authorAvatarUpdatedAt: Date | null`; `TeamThreadMessage.authorAvatarUpdatedAt: string | null`; `LoadTeamThreadResult.viewerAvatarUpdatedAt: string | null`.

- [ ] **Step 1: Write the failing test** — add to `lib/server/actions/chat/__tests__/teamThreadLoader.test.ts`

(Mirror the file's existing setup that seeds an RFP + a team message. Add:)

```ts
it('TeamThreadMessage carries authorAvatarUpdatedAt', async () => {
  // ... seed ws, member with avatar_updated_at, rfp, one team message from them ...
  // await db.update(users).set({ avatarUpdatedAt: new Date('2026-06-21T00:00:00.000Z') }).where(eq(users.id, authorId));
  const res = await loadTeamThread(rfpId);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.messages[0].authorAvatarUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
    expect(res).toHaveProperty('viewerAvatarUpdatedAt');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/actions/chat/__tests__/teamThreadLoader.test.ts`
Expected: FAIL — `authorAvatarUpdatedAt` undefined.

- [ ] **Step 3: Extend the repo projection** — `lib/server/repositories/{types.ts, drizzle/rfp-team-message.ts}`

(a) `RfpTeamMessageWithAuthor` in `types.ts`:

```ts
export type RfpTeamMessageWithAuthor = RfpTeamMessageRecord & {
  authorName: string;
  authorAvatarUpdatedAt: Date | null;
  attachments: Attachment[];
};
```

(b) `TEAM_MESSAGE_COLUMNS` in `rfp-team-message.ts`:

```ts
const TEAM_MESSAGE_COLUMNS = {
  id: rfpTeamMessages.id,
  rfpId: rfpTeamMessages.rfpId,
  workspaceId: rfpTeamMessages.workspaceId,
  authorUserId: rfpTeamMessages.authorUserId,
  body: rfpTeamMessages.body,
  createdAt: rfpTeamMessages.createdAt,
  authorName: users.name,
  authorAvatarUpdatedAt: users.avatarUpdatedAt,
} as const;
```

(The `Omit<RfpTeamMessageWithAuthor, 'attachments'>` cast in `listByScope` keeps working — the new column is part of the projection.)

- [ ] **Step 4: Extend the loader** — `lib/server/actions/chat/teamThreadLoader.ts`

(a) `TeamThreadMessage` type — add `authorAvatarUpdatedAt: string | null;`.

(b) `LoadTeamThreadResult` — add `viewerAvatarUpdatedAt: string | null;`.

(c) In `loadTeamThread`, load the viewer's avatar version and add both fields. After the `teamMembers` line:

```ts
  const viewer = await (await getUserRepo()).findById(ws.userId);
```

In the `return { ok: true, … }` object add `viewerAvatarUpdatedAt: viewer?.avatarUpdatedAt ?? null,` and in the `messages.map((m) => ({ … }))` add:

```ts
      authorAvatarUpdatedAt: m.authorAvatarUpdatedAt
        ? new Date(m.authorAvatarUpdatedAt).toISOString()
        : null,
```

Add `getUserRepo` to the factory import at the top of the file.

- [ ] **Step 5: Publish the field live** — `lib/server/actions/chat/sendTeamMessageAction.ts`

Before `publishTeamChatEvent`, load the author and add the field:

```ts
  const author = await (await getUserRepo()).findById(ws.userId);
  await publishTeamChatEvent(parsed.data.rfpId, ws.workspaceId, {
    type: 'message',
    id: result.messageId,
    body: parsed.data.body.trim(),
    authorUserId: ws.userId,
    authorName: result.authorName,
    authorAvatarUpdatedAt: author?.avatarUpdatedAt ?? null,
    createdAt: result.createdAt,
    attachments: result.attachments,
    tempId: parsed.data.tempId ?? null,
  }).catch(() => {});
```

Add `import { getUserRepo } from '@/lib/server/repositories/factory';` at the top.

- [ ] **Step 6: Extend the live payload type** — `lib/hooks/useTeamChannel.ts`

Add to `TeamLivePayload`:

```ts
  authorAvatarUpdatedAt?: string | null;
```

- [ ] **Step 7: Wire the client** — `components/messages/TeamThreadView.tsx`

(a) `Props` — add `viewerAvatarUpdatedAt: string | null;`.

(b) The author-header `<Avatar>`:

```tsx
                    <Avatar name={m.authorName} size="sm" color="surface" userId={m.authorUserId} avatarUpdatedAt={m.authorAvatarUpdatedAt} />
```

(c) The `onMessage` live-append fallback object — add `authorAvatarUpdatedAt: data.authorAvatarUpdatedAt ?? null,`.

(d) Optimistic bubble: `grep -n "isSelf: true" components/messages/TeamThreadView.tsx` (or the `handleSend` optimistic push) and add `authorAvatarUpdatedAt: viewerAvatarUpdatedAt` to that object.

(e) Update the page/parent that renders `<TeamThreadView … />` to pass `viewerAvatarUpdatedAt={…}` from `loadTeamThread`'s result (tsc will point to it).

- [ ] **Step 8: Run test + typecheck**

Run: `pnpm test lib/server/actions/chat/__tests__/teamThreadLoader.test.ts` → PASS.
Run: `pnpm tsc --noEmit` → 0 errors.

- [ ] **Step 9: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/rfp-team-message.ts lib/server/actions/chat/teamThreadLoader.ts lib/server/actions/chat/sendTeamMessageAction.ts lib/hooks/useTeamChannel.ts components/messages/TeamThreadView.tsx lib/server/actions/chat/__tests__/teamThreadLoader.test.ts
git commit -m "feat(avatar): team chat sender photos (static + live)"
```

---

### Task 12: 전체 검증 + 배포 노트

**Files:** none (verification gate).

- [ ] **Step 1: Full health pass**

Run: `pnpm tsc --noEmit` → 0 errors.
Run: `pnpm lint` → 0 errors.
Run: `pnpm test` → all green (note: the BidForm draft flake is a known load-sensitive false negative — re-run the single file if it trips; do not chase).

- [ ] **Step 2: Manual smoke (optional but recommended)**

Apply the schema to the local dev DB, then click through:

```bash
pnpm db:push   # review the printed statements: CREATE TABLE user_avatar_blobs + ALTER users ADD avatar_updated_at — both additive. Do NOT pass --force blind.
```

Then `pnpm dev`, go to `/settings/profile`, upload a PNG → it should appear immediately (router.refresh + ?v cache-bust) in the form, the header user menu, and members list.

- [ ] **Step 3: Record the deploy steps in the PR body (for `/ship`)**

```
DDL (additive, run via `pnpm db:push` against prod after review):
- CREATE TABLE user_avatar_blobs (user_id uuid PK → users.id ON DELETE CASCADE, bytes bytea, mime text, updated_at timestamptz default now())
- ALTER TABLE users ADD COLUMN avatar_updated_at timestamptz   (nullable, no default)
No backfill. No env changes. Bytes live in Postgres bytea (no object store).
```

- [ ] **Step 4: Commit any final lint fixups**

```bash
git add -A
git commit -m "chore(avatar): final lint/type cleanup"
```

---

## Known limitations (accepted for v1)

- **`Avatar`가 `'use client'`로 전환됨.** 순수 서버 트리에서 렌더되어도 안전(client 컴포넌트는 서버에서 렌더 가능). 이메일 템플릿은 `Avatar`를 쓰지 않음(Task 5 Step 5에서 grep으로 확인).
- **GET 라우트는 로그인만 확인**(같은 워크스페이스 여부는 검사하지 않음). 사용자 아바타 UUID는 추측 불가하고 앱 내에서만 노출되므로 허용. 폐기 세션(sv stale)은 GET에서 별도 검사하지 않음(읽기 전용·저민감).
- **낙관적 self 말풍선**: 발신 직후 ~수백 ms 동안은 echo 승격 전까지 viewer 본인 사진을 쓰며(Task 10/11 Step 6/7의 optimistic 필드), 그 외 모든 경로(로드된 히스토리·라이브 수신·로스터·멤버·셸)는 즉시 사진을 표시한다.
