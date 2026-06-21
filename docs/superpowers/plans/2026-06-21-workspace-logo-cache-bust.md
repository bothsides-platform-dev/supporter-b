# 워크스페이스 로고 캐시 버스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 워크스페이스 로고 변경/삭제를 모든 화면에 즉시 반영한다(현재 최대 1시간 stale 제거). 로고는 public 유지.

**Architecture:** user-avatar(PR#272)의 캐시 버스트를 워크스페이스 로고에 적용. `workspace_logo_blobs.updatedAt`(이미 존재, 미사용)를 버전 소스로, URL에 `?v={logoUpdatedAt}`를 붙이고 GET 캐시를 `public, max-age=31536000, immutable`로. `workspaces.has_logo` boolean을 `workspaces.logo_updated_at` timestamptz nullable로 교체하되, **expand → migrate → contract** 3단계로 각 태스크가 tsc-green을 유지하고 immutable 헤더는 모든 렌더 지점이 `?v`를 넘긴 뒤에만 켠다(stale 회귀 창 없음).

**Tech Stack:** Next.js 16 App Router, Drizzle + Postgres bytea, PGlite, Vitest, React 19.

## Global Constraints

- **TDD 필수**: RED(`pnpm test <path>` 실패 확인)→GREEN→커밋. 스키마/스크립트 파일은 config-exempt지만 동작은 repo/route 테스트가 RED-first로 덮는다.
- **단일 파일 테스트**: `pnpm test <path>`. 라우트 경로 `app/api/workspace/[id]/avatar/...`의 대괄호는 셸에서 **반드시 따옴표**로 감쌀 것(`pnpm test "app/api/workspace/[id]/avatar/__tests__/route.test.ts"`, `git add "app/..."`).
- **Ground-truth 검사**: 커밋 전 `node_modules/.bin/tsc --noEmit -p tsconfig.json`(exit 0) + `node_modules/.bin/eslint .`(exit 0). `pnpm -s tsc`는 이 워크트리에서 flake(exit1/무출력) → 직접 바이너리 사용. **`git commit --no-verify` 금지** — pre-commit 훅 실패 시 멈추고 보고. 커밋 후 `git status --porcelain`가 clean인지 확인(대괄호 경로 mis-escape junk dir 주의).
- **리포지토리 경계**: DB 접근은 `lib/server/repositories/**`만. 스키마는 `@/lib/db/schema` barrel로.
- **GET는 public 유지** — 인증 게이트 추가 금지(오픈 게시판 노출). POST/DELETE 검증(5MB·PNG/JPEG·`sniffMime`·SVG 차단·본인 ws ACL)은 불변.
- **캐시 버스트 불변식**: `immutable` 헤더는 URL에 `?v={Date.parse(logoUpdatedAt)}`가 항상 붙는 상태에서만 켠다(Task 2). 그 전까지 `max-age=3600` 유지.
- **expand-contract**: `workspaces.has_logo` 컬럼은 이 PR에서 **DROP하지 않는다**(코드가 더 이상 읽지/쓰지 않는 dead 컬럼이 됨). DROP은 follow-up PR(Task 4 TODOS).
- **백필 필수**: 기존 로고가 있는 워크스페이스의 `logo_updated_at`를 채워야 스위처·PG가입에서 로고가 유지됨(§Task 1).
- 베이스: `origin/dev` `b6f388b0`(PR#272 머지 후). 워크트리 `/Users/yeonseong/project/bidit/.claude/worktrees/feat+workspace-logo-cache-bust`, node_modules 심볼릭 링크. 커밋 마지막 줄: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

승인 스펙: `docs/superpowers/specs/2026-06-21-workspace-logo-cache-bust-design.md`.

---

### Task 1: Expand — `logo_updated_at` 컬럼 + 백필 + 데이터 레이어가 `logoUpdatedAt` 노출 (additive)

순수 additive. `hasLogo`는 전부 그대로 두고 `logoUpdatedAt`를 나란히 추가 → 어떤 렌더도 깨지지 않음.

**Files:**
- Modify: `lib/db/schema/workspaces.ts` (컬럼 추가)
- Create: `scripts/backfill-logo-updated-at.ts`; Modify: `package.json` (스크립트)
- Modify: `lib/server/repositories/types.ts` (`setLogoUpdatedAt` 추가; `listCanonicalPgWorkspaces` 반환타입에 logoUpdatedAt)
- Modify: `lib/server/repositories/drizzle/workspace.ts` (setLogoUpdatedAt; hydrate·3 lists가 logoUpdatedAt 추가 노출)
- Modify: `lib/types/workspace.ts` (`Workspace`·`WorkspaceMembershipSummary`에 logoUpdatedAt 추가)
- Modify: `components/messages/types.ts` (`Counterparty`에 logoUpdatedAt 추가); `lib/server/actions/chat/conversationLoaders.ts` (`ConversationListItem`에 추가 + counterparty 생성에 logoUpdatedAt)
- Modify: `app/api/workspace/[id]/avatar/route.ts` (POST/DELETE가 setLogoUpdatedAt도 호출)
- Test: `lib/server/repositories/drizzle/__tests__/workspace.test.ts` (추가 케이스)

**Interfaces:**
- Produces: `workspaces.logoUpdatedAt` (drizzle column), `WorkspaceRepo.setLogoUpdatedAt(workspaceId, value: Date | null, tx?)`, `Workspace.logoUpdatedAt: string | null`, `WorkspaceMembershipSummary.logoUpdatedAt: string | null`, `Counterparty.logoUpdatedAt?: string | null`. (모두 `hasLogo`와 공존.)

- [ ] **Step 1: Write the failing test** — append to `lib/server/repositories/drizzle/__tests__/workspace.test.ts`

```ts
  describe('setLogoUpdatedAt + logoUpdatedAt exposure', () => {
    it('findById exposes logoUpdatedAt (ISO) from the logo blob, null when absent', async () => {
      const ws = await seedBuyerWorkspace(db);
      expect((await repo.findById(ws.id))!.logoUpdatedAt).toBeNull();
      await db.insert(workspaceLogoBlobs).values({
        workspaceId: ws.id,
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mime: 'image/png',
        updatedAt: new Date('2026-06-21T00:00:00.000Z'),
      });
      expect((await repo.findById(ws.id))!.logoUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
    });

    it('setLogoUpdatedAt writes/clears workspaces.logo_updated_at and listForUser reflects it', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db);
      await seedMembership(db, ws.id, u.id);
      await repo.setLogoUpdatedAt(ws.id, new Date('2026-06-21T00:00:00.000Z'));
      expect((await repo.listForUser(u.id))[0].logoUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
      await repo.setLogoUpdatedAt(ws.id, null);
      expect((await repo.listForUser(u.id))[0].logoUpdatedAt).toBeNull();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/workspace.test.ts`
Expected: FAIL — `repo.setLogoUpdatedAt is not a function` / `logoUpdatedAt` 타입 에러.

- [ ] **Step 3: Add the column** — `lib/db/schema/workspaces.ts`

`hasLogo` 줄 바로 아래에 추가:

```ts
    hasLogo: boolean('has_logo').notNull().default(false),
    // 로고 버전/존재 겸용(user-avatar의 avatar_updated_at 패턴). NULL=로고 없음,
    // non-NULL=있음 + <img> ?v 캐시 버스트 키. 바이트는 workspace_logo_blobs.
    // (has_logo 는 더 이상 코드가 읽지 않는 dead 컬럼 — follow-up 에서 DROP.)
    logoUpdatedAt: timestamp('logo_updated_at', { withTimezone: true }),
```

- [ ] **Step 4: Add `setLogoUpdatedAt` to the repo interface** — `lib/server/repositories/types.ts`

`setHasLogo` 시그니처(311-312) 바로 아래에 추가:

```ts
  /** hasLogo 플래그 갱신. */
  setHasLogo(workspaceId: string, hasLogo: boolean, tx?: Tx): Promise<void>;
  /** 로고 버전 스탬프 — 업로드 시 now(Date), 삭제 시 null. */
  setLogoUpdatedAt(workspaceId: string, value: Date | null, tx?: Tx): Promise<void>;
```

그리고 `listCanonicalPgWorkspaces` 반환 타입(236-237)에 `logoUpdatedAt` 추가:

```ts
  listCanonicalPgWorkspaces(): Promise<{ id: string; name: string; canonicalPgKey: string; hasLogo: boolean; logoUpdatedAt: string | null }[]>;
```

- [ ] **Step 5: Implement repo changes** — `lib/server/repositories/drizzle/workspace.ts`

(a) `hydrate` — 로고 조회를 `updatedAt`까지 select하고 반환 객체에 `logoUpdatedAt` 추가:

```ts
    const [logoRow] = await db
      .select({ updatedAt: workspaceLogoBlobs.updatedAt })
      .from(workspaceLogoBlobs)
      .where(eq(workspaceLogoBlobs.workspaceId, ws.id))
      .limit(1);

    return {
      id: ws.id,
      type: ws.type,
      name: ws.name,
      bizProfile,
      members,
      hasLogo: !!logoRow,
      logoUpdatedAt: logoRow?.updatedAt ? new Date(logoRow.updatedAt).toISOString() : null,
      createdAt: new Date(ws.createdAt).toISOString(),
    };
```

(b) `listForUser` — select에 추가(`hasLogo` 다음 줄): `logoUpdatedAt: workspaces.logoUpdatedAt,` — 그리고 반환을 ISO로 매핑. 기존 `return (await db.select({...})...) as WorkspaceMembershipSummary[];`를 다음으로 교체:

```ts
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        type: workspaces.type,
        status: workspaces.status,
        role: workspaceMembers.role,
        memberApprovalStatus: workspaceMembers.approvalStatus,
        unreadCount: sql<number>`(
          SELECT COALESCE(COUNT(*)::int, 0)
          FROM notifications
          WHERE workspace_id = ${workspaces.id}
            AND user_id = ${userId}
            AND channel = 'in_app'
            AND read_at IS NULL
        )`,
        hasLogo: workspaces.hasLogo,
        logoUpdatedAt: workspaces.logoUpdatedAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.joinedAt));
    return rows.map((r: { logoUpdatedAt: Date | null }) => ({
      ...r,
      logoUpdatedAt: r.logoUpdatedAt ? new Date(r.logoUpdatedAt).toISOString() : null,
    })) as WorkspaceMembershipSummary[];
```

(c) `listAllWorkspacesForMaster` — 동일 패턴: select에 `logoUpdatedAt: workspaces.logoUpdatedAt,` 추가하고 `rows.map`으로 ISO 매핑(위와 같은 형태로 `return rows.map(...) as WorkspaceMembershipSummary[];`).

(d) `listCanonicalPgWorkspaces` — select에 `logoUpdatedAt: workspaces.logoUpdatedAt` 추가, 최종 map에서 ISO 매핑:

```ts
    return rows.map((r) => ({
      ...r,
      canonicalPgKey: r.canonicalPgKey!,
      logoUpdatedAt: r.logoUpdatedAt ? new Date(r.logoUpdatedAt).toISOString() : null,
    }));
```
(row 캐스트 타입에 `logoUpdatedAt: Date | null` 추가.)

(e) `setLogoUpdatedAt` 메서드 추가(`setHasLogo` 아래):

```ts
  async setLogoUpdatedAt(workspaceId: string, value: Date | null, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(workspaces).set({ logoUpdatedAt: value }).where(eq(workspaces.id, workspaceId));
  }
```

- [ ] **Step 6: Add `logoUpdatedAt` to types** (alongside hasLogo)

`lib/types/workspace.ts`:
```ts
export type Workspace = {
  id: string;
  type: WorkspaceType;
  name: string;
  bizProfile?: BizProfile;
  members: User[];
  hasLogo: boolean;
  logoUpdatedAt: string | null;
  createdAt: string;
};
```
```ts
export type WorkspaceMembershipSummary = {
  id: string;
  name: string;
  type: WorkspaceType;
  status: 'pending' | 'active' | 'suspended';
  role: 'admin' | 'member';
  memberApprovalStatus: MemberApprovalStatus;
  unreadCount: number;
  hasLogo: boolean;
  logoUpdatedAt: string | null;
};
```
`components/messages/types.ts` `Counterparty`:
```ts
export type Counterparty = {
  name: string;
  type: CounterpartyType;
  workspaceId?: string;
  hasLogo?: boolean;
  logoUpdatedAt?: string | null;
};
```
`lib/server/actions/chat/conversationLoaders.ts` — `ConversationListItem.counterparty` 타입에 `logoUpdatedAt: string | null` 추가, 그리고 counterparty 생성(104-111)에 추가:
```ts
        counterparty: {
          workspaceId: counterpartyWsId,
          name: counterpartyWs?.name ?? '상대',
          type: counterpartyType,
          hasLogo: counterpartyWs?.hasLogo ?? false,
          logoUpdatedAt: counterpartyWs?.logoUpdatedAt ?? null,
        },
```

- [ ] **Step 7: Route also writes `logo_updated_at`** — `app/api/workspace/[id]/avatar/route.ts`

POST 성공부:
```ts
  await (await getWorkspaceLogoRepo()).upsert(id, buffer, sniffed);
  await (await getWorkspaceRepo()).setHasLogo(id, true);
  await (await getWorkspaceRepo()).setLogoUpdatedAt(id, new Date());
```
DELETE:
```ts
  await (await getWorkspaceLogoRepo()).remove(id);
  await (await getWorkspaceRepo()).setHasLogo(id, false);
  await (await getWorkspaceRepo()).setLogoUpdatedAt(id, null);
```
(GET 헤더는 이 태스크에서 변경하지 않음 — `max-age=3600` 유지.)

- [ ] **Step 8: Backfill script** — `scripts/backfill-logo-updated-at.ts`

기존 backfill 스크립트(`scripts/backfill-*.ts`) 패턴을 따라 작성. 핵심 SQL:
```ts
// 기존 로고가 있는 워크스페이스의 logo_updated_at 을 blob.updated_at 으로 채운다(멱등).
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  const res = await db.execute(sql`
    UPDATE workspaces w
    SET logo_updated_at = b.updated_at
    FROM workspace_logo_blobs b
    WHERE w.id = b.workspace_id AND w.logo_updated_at IS NULL
  `);
  console.log('[backfill:logo-updated-at] done', res);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```
`package.json` scripts에 추가: `"backfill:logo-updated-at": "tsx scripts/backfill-logo-updated-at.ts",` (기존 `backfill:*` 항목 옆). 스크립트 자체는 TDD-exempt(일회용 운영 스크립트) — repo 테스트가 `logo_updated_at` 동작을 덮는다.

- [ ] **Step 9: Run test + ground-truth**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/workspace.test.ts` → PASS.
Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json` (0) — `Workspace.logoUpdatedAt`/`WorkspaceMembershipSummary.logoUpdatedAt`를 필수로 추가했으니 생산 지점(hydrate·lists)은 채웠고, 소비 지점은 아직 안 읽으므로 OK. tsc가 다른 `Workspace`/`WorkspaceMembershipSummary` 리터럴(픽스처)을 지적하면 `logoUpdatedAt: null` 추가. Run `node_modules/.bin/eslint .` (0).

- [ ] **Step 10: Commit**

```bash
git add lib/db/schema/workspaces.ts scripts/backfill-logo-updated-at.ts package.json lib/server/repositories/types.ts lib/server/repositories/drizzle/workspace.ts lib/types/workspace.ts components/messages/types.ts lib/server/actions/chat/conversationLoaders.ts "app/api/workspace/[id]/avatar/route.ts" lib/server/repositories/drizzle/__tests__/workspace.test.ts
git commit -m "feat(ws-logo): expand — logo_updated_at column + setLogoUpdatedAt + data layer exposes logoUpdatedAt"
```

---

### Task 2: Migrate — `WorkspaceAvatar` `?v` + 모든 렌더 지점이 `logoUpdatedAt` 사용 + GET immutable

이제 모든 `<img>`가 `?v`를 갖게 되므로 GET 헤더를 immutable로 켠다. 타입엔 아직 `hasLogo`도 남아 있어 tsc-green.

**Files:**
- Modify: `components/primitives/WorkspaceAvatar.tsx` (logoUpdatedAt prop + ?v + imgError 리셋)
- Test: `components/primitives/__tests__/WorkspaceAvatar.test.tsx`
- Modify (렌더 지점, `hasLogo=` → `logoUpdatedAt=`): `components/shell/WorkspaceSwitcher.tsx`, `components/settings/WorkspaceLogoForm.tsx`, `app/(app)/settings/profile/page.tsx`, `components/messages/CounterpartyProfileCard.tsx`, `components/messages/ConversationList.tsx`, `components/messages/RecipientCard.tsx`, `components/home/RecentMessagesPanel.tsx`, `app/(public)/signup/pg/workspace/PgWorkspaceStep.tsx`, `components/messages/ChatPanel.tsx`, `components/messages/ThreadPane.tsx`, `components/shell/Sidebar.tsx`, `app/(app)/layout.tsx`
- Modify: `app/api/workspace/[id]/avatar/route.ts` (GET 헤더)
- Test: `app/api/workspace/[id]/avatar/__tests__/route.test.ts` (immutable)

**Interfaces:**
- Consumes: `logoUpdatedAt` from Task 1 producers.
- Produces: `WorkspaceAvatar` prop `logoUpdatedAt?: string | null` (img `?v`); GET `Cache-Control: public, max-age=31536000, immutable`.

- [ ] **Step 1: Write the failing test** — `components/primitives/__tests__/WorkspaceAvatar.test.tsx` (추가)

```tsx
  it('renders img with ?v cache-bust when logoUpdatedAt is set', () => {
    render(<WorkspaceAvatar name="Supporter B" workspaceId="ws-9" logoUpdatedAt="2026-06-21T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', `/api/workspace/ws-9/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
  });

  it('renders initials when logoUpdatedAt is null', () => {
    render(<WorkspaceAvatar name="Acme" workspaceId="ws-9" logoUpdatedAt={null} />);
    const el = screen.getByRole('img');
    expect(el.tagName).not.toBe('IMG');
  });

  it('re-renders img after logoUpdatedAt changes following an error fallback', () => {
    const { rerender } = render(<WorkspaceAvatar name="Acme" workspaceId="ws-9" logoUpdatedAt="2026-06-21T00:00:00.000Z" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').tagName).not.toBe('IMG');
    rerender(<WorkspaceAvatar name="Acme" workspaceId="ws-9" logoUpdatedAt="2026-06-22T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', `/api/workspace/ws-9/avatar?v=${Date.parse('2026-06-22T00:00:00.000Z')}`);
  });
```
또한 route 테스트(`app/api/workspace/[id]/avatar/__tests__/route.test.ts`)의 GET-200 케이스 단언을 추가: `expect(res.headers.get('Cache-Control')).toContain('immutable');`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/primitives/__tests__/WorkspaceAvatar.test.tsx`
Expected: FAIL — `logoUpdatedAt`가 prop에 없어 img가 안 그려짐 / `?v` 없음.

- [ ] **Step 3: Update `WorkspaceAvatar`** — `components/primitives/WorkspaceAvatar.tsx`

```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getWorkspaceInitials, getWorkspaceColor } from '@/lib/utils/workspace-avatar';

type Props = {
  name: string;
  size?: 'sm' | 'md';
  workspaceId?: string;
  /** 로고 버전(ISO). 있으면 사진 + ?v 캐시 버스트, 없으면 이니셜. */
  logoUpdatedAt?: string | null;
  className?: string;
};

const sizeMap = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-7 h-7 text-[11px]',
};

const imgSizeMap = {
  sm: 'w-6 h-6',
  md: 'w-7 h-7',
};

export function WorkspaceAvatar({ name, size = 'sm', workspaceId, logoUpdatedAt, className }: Props) {
  const [imgError, setImgError] = useState(false);
  const [prevLogoUpdatedAt, setPrevLogoUpdatedAt] = useState(logoUpdatedAt);
  // 로고 버전이 바뀌면 렌더 중 imgError 동기 리셋(React derived-state 패턴).
  if (logoUpdatedAt !== prevLogoUpdatedAt) {
    setPrevLogoUpdatedAt(logoUpdatedAt);
    setImgError(false);
  }

  if (logoUpdatedAt && workspaceId && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bytes served from our own API route; no external domain needed
      <img
        src={`/api/workspace/${workspaceId}/avatar?v=${Date.parse(logoUpdatedAt)}`}
        alt={name}
        role="img"
        onError={() => setImgError(true)}
        className={cn(
          'inline-block shrink-0 object-cover',
          'rounded-[var(--md-sys-shape-extra-small)]',
          imgSizeMap[size],
          className,
        )}
      />
    );
  }

  const initials = getWorkspaceInitials(name);
  const color = getWorkspaceColor(name);
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center shrink-0',
        'rounded-[var(--md-sys-shape-extra-small)]',
        'font-[number:var(--md-typescale-label-large-weight)] select-none',
        sizeMap[size],
        className,
      )}
      style={{ background: color.bg, color: color.fg }}
    >
      {initials}
    </div>
  );
}
```
(주: prop을 `hasLogo` → `logoUpdatedAt`로 **교체**. 모든 호출부를 이 태스크에서 동시에 바꾸므로 tsc-green.)

- [ ] **Step 4: Migrate every render site `hasLogo={…}` → `logoUpdatedAt={…}`**

각 파일의 정확한 치환(나머지 props 불변):
- `components/shell/WorkspaceSwitcher.tsx`: `Props.current`·`pending` state·`setPending`·`display`의 `hasLogo: boolean` → `logoUpdatedAt: string | null`; 두 `<WorkspaceAvatar … hasLogo={display.hasLogo}/{ws.hasLogo}>` → `logoUpdatedAt={display.logoUpdatedAt}` / `logoUpdatedAt={ws.logoUpdatedAt}`.
- `components/settings/WorkspaceLogoForm.tsx`: `Props` `hasLogo: boolean` → `logoUpdatedAt: string | null`; `<WorkspaceAvatar … hasLogo={hasLogo}>` → `logoUpdatedAt={logoUpdatedAt}`; 삭제버튼 게이트 `{hasLogo && (` → `{logoUpdatedAt != null && (`.
- `app/(app)/settings/profile/page.tsx`: `<WorkspaceLogoForm … hasLogo={ws.hasLogo}>` → `logoUpdatedAt={ws.logoUpdatedAt}`.
- `components/messages/CounterpartyProfileCard.tsx`: 두 `<WorkspaceAvatar … hasLogo={counterparty.hasLogo}>` → `logoUpdatedAt={counterparty.logoUpdatedAt}`.
- `components/messages/ConversationList.tsx`: `hasLogo={item.counterparty.hasLogo}` → `logoUpdatedAt={item.counterparty.logoUpdatedAt}`.
- `components/messages/RecipientCard.tsx`: `hasLogo={counterparty.hasLogo}` → `logoUpdatedAt={counterparty.logoUpdatedAt}`.
- `components/home/RecentMessagesPanel.tsx`: `hasLogo={item.counterparty.hasLogo}` → `logoUpdatedAt={item.counterparty.logoUpdatedAt}`.
- `app/(public)/signup/pg/workspace/PgWorkspaceStep.tsx`: `CanonicalCompany` 타입 `hasLogo: boolean` → `logoUpdatedAt: string | null`; `<WorkspaceAvatar … hasLogo={company.hasLogo}>` → `logoUpdatedAt={company.logoUpdatedAt}`. (이 회사 목록은 `listCanonicalPgWorkspaces`에서 옴 — Task 1이 logoUpdatedAt 추가함.)
- `components/messages/ChatPanel.tsx`: `counterpartyFallback={{ ...counterparty, hasLogo: false }}` → `{{ ...counterparty, logoUpdatedAt: null }}`.
- `components/messages/ThreadPane.tsx`: `counterpartyFallback` 타입 `hasLogo: boolean` → `logoUpdatedAt: string | null`.
- `components/shell/Sidebar.tsx`: `SidebarProps.current` `hasLogo: boolean` → `logoUpdatedAt: string | null`.
- `app/(app)/layout.tsx`: `current: { …, hasLogo: active.hasLogo }` → `logoUpdatedAt: active.logoUpdatedAt`.

(`ThreadView.tsx` 헤더의 `<WorkspaceAvatar … workspaceId={counterparty.workspaceId} />`는 현재 hasLogo도 logoUpdatedAt도 안 넘김 → 변경 불필요, 이니셜 폴백 유지.)

- [ ] **Step 5: Flip GET cache header to immutable** — `app/api/workspace/[id]/avatar/route.ts`

GET의 `'Cache-Control': 'public, max-age=3600, s-maxage=3600',` →
```ts
      'Cache-Control': 'public, max-age=31536000, immutable',
```
(public 유지. 모든 호출부가 이제 `?v`를 넘기므로 immutable 안전.)

- [ ] **Step 6: Run tests + ground-truth**

Run: `pnpm test components/primitives/__tests__/WorkspaceAvatar.test.tsx "app/api/workspace/[id]/avatar/__tests__/route.test.ts"` → PASS.
Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json` (0) + `node_modules/.bin/eslint .` (0). tsc가 누락 렌더 지점을 잡으면 수정.

- [ ] **Step 7: Commit**

```bash
git add components/primitives/WorkspaceAvatar.tsx components/primitives/__tests__/WorkspaceAvatar.test.tsx components/shell/WorkspaceSwitcher.tsx components/settings/WorkspaceLogoForm.tsx "app/(app)/settings/profile/page.tsx" components/messages/CounterpartyProfileCard.tsx components/messages/ConversationList.tsx components/messages/RecipientCard.tsx components/home/RecentMessagesPanel.tsx "app/(public)/signup/pg/workspace/PgWorkspaceStep.tsx" components/messages/ChatPanel.tsx components/messages/ThreadPane.tsx components/shell/Sidebar.tsx "app/(app)/layout.tsx" "app/api/workspace/[id]/avatar/route.ts" "app/api/workspace/[id]/avatar/__tests__/route.test.ts"
git commit -m "feat(ws-logo): migrate render sites to logoUpdatedAt + ?v + immutable GET cache"
```

---

### Task 3: Contract — `hasLogo` 제거 (types·props·producers·route·repo)

이제 아무도 `hasLogo`를 읽지 않으므로 코드에서 제거. `workspaces.has_logo` DB 컬럼은 남김(follow-up DROP).

**Files:**
- Modify: `lib/types/workspace.ts`, `components/messages/types.ts`, `lib/server/actions/chat/conversationLoaders.ts`, `lib/server/repositories/types.ts`, `lib/server/repositories/drizzle/workspace.ts`, `app/api/workspace/[id]/avatar/route.ts`
- Modify (tests): `lib/server/repositories/drizzle/__tests__/workspace.test.ts`, `lib/server/repositories/drizzle/__tests__/workspace.canonical-pg.test.ts`, `lib/server/dashboard/__tests__/homeMessages.test.ts`

**Interfaces:** removes `hasLogo` from `Workspace`, `WorkspaceMembershipSummary`, `Counterparty`, `ConversationListItem`, `listCanonicalPgWorkspaces` 반환, `WorkspaceRepo.setHasLogo`.

- [ ] **Step 1: Remove `hasLogo` from production code**

- `lib/types/workspace.ts`: `Workspace`·`WorkspaceMembershipSummary`에서 `hasLogo: boolean;` 줄 삭제.
- `components/messages/types.ts`: `Counterparty`에서 `hasLogo?: boolean;` 삭제.
- `lib/server/actions/chat/conversationLoaders.ts`: `ConversationListItem.counterparty` 타입에서 `hasLogo: boolean` 삭제; counterparty 생성에서 `hasLogo: counterpartyWs?.hasLogo ?? false,` 줄 삭제.
- `lib/server/repositories/drizzle/workspace.ts`: `hydrate` 반환에서 `hasLogo: !!logoRow,` 삭제; `listForUser`·`listAllWorkspacesForMaster`·`listCanonicalPgWorkspaces` select에서 `hasLogo: workspaces.hasLogo,` 삭제; `setHasLogo` 메서드 삭제. (참고: blob 조회는 `logoRow`만 쓰므로 유지.)
- `lib/server/repositories/types.ts`: `WorkspaceRepo`에서 `setHasLogo` 시그니처 삭제; `listCanonicalPgWorkspaces` 반환 타입에서 `hasLogo: boolean;` 삭제.
- `app/api/workspace/[id]/avatar/route.ts`: POST의 `await (await getWorkspaceRepo()).setHasLogo(id, true);` 삭제; DELETE의 `setHasLogo(id, false);` 삭제. (setLogoUpdatedAt만 남김.)

- [ ] **Step 2: Update tests (hasLogo → logoUpdatedAt)**

- `workspace.test.ts`: `findById … hasLogo`/`listForUser … hasLogo`/`describe('setHasLogo' …)` 케이스를 `logoUpdatedAt`/`setLogoUpdatedAt` 기준으로 교체(또는 Task 1에서 추가한 케이스로 대체되었으면 중복 제거). `listForUser reads hasLogo from workspaces.has_logo` 류 단언은 `logo_updated_at` 컬럼 기준으로.
- `workspace.canonical-pg.test.ts`: `hasLogo: false/true` insert + `toMatchObject({ … hasLogo })` → `logoUpdatedAt` 기준. 예: insert에 `logoUpdatedAt: new Date(...)` 또는 미설정(null), 단언 `toMatchObject({ canonicalPgKey, logoUpdatedAt: <ISO|null> })`.
- `homeMessages.test.ts`: `conv()` 픽스처의 `counterparty: { …, hasLogo: false }` → `logoUpdatedAt: null`.
- `route.test.ts`(Task 2에서 immutable 추가됨): `POST … sets has_logo`/`DELETE … clears has_logo` 단언을 `workspaces.logoUpdatedAt`(non-null/null)로 교체. (POST 후 `logo_updated_at`이 non-null, DELETE 후 null.)

- [ ] **Step 3: Run full ground-truth**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json` (0 — `hasLogo` 잔존 참조가 있으면 tsc가 전부 잡는다, 각 수정). `node_modules/.bin/eslint .` (0). 영향 테스트 실행:
`pnpm test lib/server/repositories/drizzle/__tests__/workspace.test.ts lib/server/repositories/drizzle/__tests__/workspace.canonical-pg.test.ts lib/server/dashboard/__tests__/homeMessages.test.ts "app/api/workspace/[id]/avatar/__tests__/route.test.ts"` → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ws-logo): contract — remove hasLogo from code (DB column dropped in follow-up)"
```
(주: `git add -A` 전에 `git status`로 의도한 파일만인지 확인 — junk dir 없을 것.)

---

### Task 4: 전체 검증 + 배포/TODOS

- [ ] **Step 1: Full health**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json` (0) · `node_modules/.bin/eslint .` (0) · `pnpm test` (all green; BidForm draft flake는 알려진 false-negative, 단독 재실행).

- [ ] **Step 2: TODOS — follow-up `has_logo` DROP 기록**

`TODOS.md`의 적절한 컴포넌트 섹션에 추가:
```
- **workspaces.has_logo 컬럼 DROP**: 워크스페이스 로고가 logo_updated_at 로 전환됨(이 PR). has_logo 는 더 이상 코드가 읽지/쓰지 않는 dead 컬럼. 배포 안정 확인 후 `ALTER TABLE workspaces DROP COLUMN has_logo;` (또는 schema 에서 제거 후 db:push). Priority: P3.
```

- [ ] **Step 3: PR body 배포 노트 (for `/ship`)**

```
DDL (additive): pnpm db:push 로 workspaces.logo_updated_at 컬럼 추가. has_logo 는 이 PR에서 유지(미사용).
배포 순서: db:push → `pnpm backfill:logo-updated-at`(기존 로고의 logo_updated_at 채움) → pm2 restart.
백필 안 하면 스위처·PG가입에서 기존 로고가 이니셜로 보임(hydrate 경로는 blob 조인이라 영향 없음).
follow-up: has_logo 컬럼 DROP (TODOS).
env·백필 외 변경 없음.
```

---

## Known limitations / notes
- `workspaces.has_logo` 컬럼은 이 PR 이후 dead(미사용) 상태로 남고 follow-up에서 DROP — expand-contract 안전 마이그레이션.
- `WorkspaceAvatar`가 client 컴포넌트라 imgError 리셋은 user-avatar `Avatar`와 동일한 derived-state 패턴 사용(`useEffect`는 `react-hooks/set-state-in-effect` lint에 걸림 — 사용 금지).
- GET는 public 유지(오픈 게시판). `?v` + immutable로 staleness만 해소.
