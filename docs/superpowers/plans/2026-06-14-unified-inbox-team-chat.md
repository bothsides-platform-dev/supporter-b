# 통합 메시지함 (팀 채팅을 /messages 에 흡수) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/messages` 표준 메시지함에서 상대방 채팅(이미 공유됨)과 팀 채팅(`rfp_team_messages`)을 하나의 필터 목록으로 모두 확인하고, 팀 채팅에 읽음상태·안읽음·알림(인앱+이메일) 풀 패리티를 부여한다.

**Architecture:** 상대방(쌍 단위)과 팀(RFP 단위)은 구조가 달라 합치지 않고 **얇은 통합 로더**(`listInboxForViewer`)로 표현 계층에서 병합한다. 팀 읽음상태는 `chat_conversation_reads` 를 미러한 새 테이블로, 팀 알림은 `ChatService` 다이제스트 패턴을 미러한 새 outbox 이벤트/프로세서로 구현한다. 단일 Drizzle repo 구현을 PGlite로 테스트한다(별도 memory impl 없음).

**Tech Stack:** Next.js App Router, Drizzle ORM + Postgres, three-layer server (actions→services→repositories), Vitest + PGlite, Centrifugo, Resend/outbox, React 19.

**참조 스펙:** `docs/superpowers/specs/2026-06-14-unified-inbox-team-chat-design.md`

---

## 공통 규칙 (모든 태스크)

- 작업 디렉터리는 **워크트리 루트** `/Users/yeonseong/project/bidit/.claude/worktrees/feat+unified-inbox-team-chat` 고정. 절대경로는 항상 이 prefix 하위로(워크트리 절대경로 함정 주의 — main 저장소를 건드리면 vitest 가 미수정본을 실행).
- 단일 파일 테스트: `pnpm test <path>` 로 RED/GREEN 을 빠르게 확인. 전체 그린은 마지막에 `pnpm test`.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 신규 테이블은 schema 파일 + `lib/db/schema/index.ts` export 만으로 `generateSchemaDDL()`(`lib/db/schema-ddl.ts`)·PGlite 부트스트랩에 자동 포함된다(별도 마이그레이션 파일 없음 — push-only).
- 공유 5432 DB 에 `drizzle-kit push` 하지 말 것(타 워크트리 테이블 드롭 위험). 배포 SQL 은 PR 본문에 첨부.

## File Structure (생성/수정)

**STAGE 1 — 가시화**
- Create `lib/db/schema/rfp-team-message-reads.ts` — 팀 스레드 per-user 읽음 워터마크 테이블.
- Modify `lib/db/schema/index.ts` — 새 테이블 export.
- Create `lib/server/repositories/drizzle/rfp-team-message-read.ts` — `DrizzleRfpTeamMessageReadRepository`.
- Modify `lib/server/repositories/types.ts` — `RfpTeamMessageRead`, `RfpTeamMessageReadRepo`, `TeamThreadSummary`, `RfpTeamMessageRepo.listThreadsForWorkspace`.
- Modify `lib/server/repositories/drizzle/rfp-team-message.ts` — `listThreadsForWorkspace`.
- Modify `lib/server/repositories/factory.ts` — `rfpTeamMessageRead` 등록 + `getRfpTeamMessageReadRepo`.
- Modify `lib/server/services/team-chat.ts` — `readRepo` dep + `markRead` + `listThreads`.
- Create `lib/server/actions/chat/markTeamThreadReadAction.ts`.
- Create `lib/server/actions/chat/inboxLoader.ts` — `listTeamThreadsForViewer`, `listInboxForViewer`, `InboxListItem`.
- Modify `lib/server/actions/chat/conversationLoaders.ts` — `loadConversationThread` 가 `rfpById` 반환.
- Modify `components/messages/types.ts` — `InboxListItem` re-export.
- Modify `components/messages/ThreadPane.tsx` — `rfpById` 를 로더에서 도출(prop 제거).
- Modify `components/messages/ThreadView.tsx` 호출부는 변화 없음(prop 그대로).
- Create `components/messages/TeamThreadPane.tsx` — Suspense + `loadTeamThread` + `TeamThreadView`.
- Modify `components/messages/ConversationList.tsx` — `InboxListItem` 렌더(kind 분기).
- Modify `components/messages/MessageInbox.tsx` — 필터 칩 + 통합 선택 라우팅.
- Modify `app/(app)/messages/page.tsx` — `listInboxForViewer` + `?t` 처리.
- Modify `components/messages/TeamThreadView.tsx` — 마운트 시 `markTeamThreadReadAction`.
- Modify `components/messages/ChatPanel.tsx` — 팀 탭 "메시지함에서 열기" 링크 + `rfpById` prop 제거.
- Modify `lib/server/dashboard/homeMessages.ts`, `components/home/RecentMessagesPanel.tsx`, `components/home/HomeDashboard.tsx`, `components/home/BuyerHome.tsx`, `components/home/PgHome.tsx` — 통합 목록.

**STAGE 2 — 알림**
- Modify `lib/server/repositories/types.ts` — `NotificationRepo.hasPendingTeamNotification`.
- Modify `lib/server/repositories/drizzle/notification.ts` — 구현.
- Modify `lib/server/actions/chat/_shared.ts` — `teamDigestDedupeKey` / `parseTeamDigestDedupeKey`.
- Modify `lib/db/schema/_enums.ts` + `lib/server/outbox/types.ts` — `team_chat.message` 이벤트.
- Modify `lib/server/repositories/drizzle/outbox.ts` — `dueTeamChatDigests` + 제네릭 flush 제외.
- Modify `lib/server/services/team-chat.ts` — `sendMessage` 알림 팬아웃(인앱+이메일 enqueue).
- Create `lib/server/outbox/team-chat-digest-flush.ts` — `flushTeamChatDigests`.
- Modify `app/api/cron/flush-outbox/route.ts` — 팀 다이제스트 처리 호출.
- Modify `lib/server/services/team-chat.ts`, `lib/db/schema/rfp-team-messages.ts`, `lib/server/actions/chat/sendTeamMessageAction.ts` — v1 "알림 없음" 주석 갱신.
- Modify `SCREEN_DESIGN.md` — 메시지함 IA.

## 공유 타입 (태스크 간 일관성)

```ts
// lib/server/repositories/types.ts
export type RfpTeamMessageRead = { rfpId: string; workspaceId: string; userId: string; lastReadAt: Date };
export interface RfpTeamMessageReadRepo {
  upsert(rfpId: string, workspaceId: string, userId: string, at: Date, tx?: Tx): Promise<void>;
  getFor(rfpId: string, workspaceId: string, userId: string, tx?: Tx): Promise<RfpTeamMessageRead | undefined>;
}
export type TeamThreadSummary = { rfpId: string; lastMessageAt: Date; lastBody: string; lastAuthorUserId: string };
// RfpTeamMessageRepo 에 추가:
//   listThreadsForWorkspace(workspaceId: string, tx?: Tx): Promise<TeamThreadSummary[]>;

// lib/server/services/team-chat.ts
export type TeamThreadEntry = { rfpId: string; rfpCode: string; rfpTitle: string; preview: string; lastMessageAt: string; unread: boolean };

// lib/server/actions/chat/inboxLoader.ts
export type InboxListItem =
  | ({ kind: 'counterparty'; key: string } & ConversationListItem)
  | { kind: 'team'; key: string; rfpId: string; rfpCode: string; rfpTitle: string; preview: string; lastMessageAt: string | null; unread: boolean };
// key = `c:${conversationId}` | `t:${rfpId}`
```

---

# STAGE 1 — 가시화 ("모두 확인")

### Task 1: 팀 읽음상태 테이블 + repo (`RfpTeamMessageReadRepo`)

**Files:**
- Test: `lib/server/repositories/drizzle/__tests__/rfp-team-message-read.test.ts`
- Create: `lib/db/schema/rfp-team-message-reads.ts`
- Modify: `lib/db/schema/index.ts`
- Create: `lib/server/repositories/drizzle/rfp-team-message-read.ts`
- Modify: `lib/server/repositories/types.ts`, `lib/server/repositories/factory.ts`

- [ ] **Step 1: 실패 테스트 작성** — `lib/server/repositories/drizzle/__tests__/rfp-team-message-read.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { seedUser, seedBuyerWorkspace, seedRfp } from './_seed';
import { DrizzleRfpTeamMessageReadRepository } from '../rfp-team-message-read';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });
afterEach(async () => { await db.$client.close?.(); });

describe('DrizzleRfpTeamMessageReadRepository', () => {
  it('upsert inserts then updates monotonically; getFor reads back', async () => {
    const u = await seedUser(db, { email: 'm@b.com', name: '멤버' });
    const ws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: u.id });
    const repo = new DrizzleRfpTeamMessageReadRepository(db);

    expect(await repo.getFor(rfp.id, ws.id, u.id)).toBeUndefined();

    const t1 = new Date('2026-06-14T00:00:00Z');
    await repo.upsert(rfp.id, ws.id, u.id, t1);
    expect((await repo.getFor(rfp.id, ws.id, u.id))?.lastReadAt.toISOString()).toBe(t1.toISOString());

    const t2 = new Date('2026-06-14T01:00:00Z');
    await repo.upsert(rfp.id, ws.id, u.id, t2);
    expect((await repo.getFor(rfp.id, ws.id, u.id))?.lastReadAt.toISOString()).toBe(t2.toISOString());
  });

  it('isolates read state per (rfp, workspace, user)', async () => {
    const a = await seedUser(db, { email: 'a@b.com', name: 'A' });
    const b = await seedUser(db, { email: 'b@b.com', name: 'B' });
    const ws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: a.id });
    const repo = new DrizzleRfpTeamMessageReadRepository(db);
    await repo.upsert(rfp.id, ws.id, a.id, new Date());
    expect(await repo.getFor(rfp.id, ws.id, b.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-team-message-read.test.ts`
Expected: FAIL — `Cannot find module '../rfp-team-message-read'`.

- [ ] **Step 3: 스키마 테이블 생성** — `lib/db/schema/rfp-team-message-reads.ts`

```ts
import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { users } from './users';

// Per-user read state for an RFP team thread — backs the team-chat unread badge
// in the unified inbox. Scope mirrors rfp_team_messages (rfp_id, workspace_id):
// the buyer team and each PG team keep fully separate read cursors on the same
// RFP. PK(rfp_id, workspace_id, user_id) makes upsert idempotent; last_read_at
// advances monotonically. Cascades away with the RFP/workspace/user.
export const rfpTeamMessageReads = pgTable(
  'rfp_team_message_reads',
  {
    rfpId: uuid('rfp_id').notNull().references(() => rfps.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.rfpId, t.workspaceId, t.userId] })],
);
```

- [ ] **Step 4: schema barrel export** — `lib/db/schema/index.ts` 의 `export * from './rfp-team-messages';` 바로 다음 줄에 추가:

```ts
export * from './rfp-team-message-reads';
```

- [ ] **Step 5: 타입 추가** — `lib/server/repositories/types.ts`, `ChatReadRepo` 블록(약 623–650행) 다음에 추가:

```ts
// ── RFP Team Message Read State ───────────────────────────────────────
/** (rfp, workspace, user) 팀 스레드 읽음 row — 통합 인박스 팀 안읽음 배지 근거. */
export type RfpTeamMessageRead = {
  rfpId: string;
  workspaceId: string;
  userId: string;
  lastReadAt: Date;
};

export interface RfpTeamMessageReadRepo {
  /** (rfp, workspace, user) PK upsert — last_read_at 갱신(idempotent, monotonic). */
  upsert(rfpId: string, workspaceId: string, userId: string, at: Date, tx?: Tx): Promise<void>;
  /** (rfp, workspace, user) 읽음 row 조회. 없으면 undefined. */
  getFor(rfpId: string, workspaceId: string, userId: string, tx?: Tx): Promise<RfpTeamMessageRead | undefined>;
}
```

- [ ] **Step 6: Drizzle repo 구현** — `lib/server/repositories/drizzle/rfp-team-message-read.ts`

```ts
import { and, eq } from 'drizzle-orm';
import { rfpTeamMessageReads } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { RfpTeamMessageRead, RfpTeamMessageReadRepo, Tx } from '../types';

const READ_COLUMNS = {
  rfpId: rfpTeamMessageReads.rfpId,
  workspaceId: rfpTeamMessageReads.workspaceId,
  userId: rfpTeamMessageReads.userId,
  lastReadAt: rfpTeamMessageReads.lastReadAt,
} as const;

export class DrizzleRfpTeamMessageReadRepository implements RfpTeamMessageReadRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any { return tx ?? this._db; }

  async upsert(rfpId: string, workspaceId: string, userId: string, at: Date, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(rfpTeamMessageReads)
      .values({ rfpId, workspaceId, userId, lastReadAt: at })
      .onConflictDoUpdate({
        target: [rfpTeamMessageReads.rfpId, rfpTeamMessageReads.workspaceId, rfpTeamMessageReads.userId],
        set: { lastReadAt: at },
      });
  }

  async getFor(rfpId: string, workspaceId: string, userId: string, tx?: Tx): Promise<RfpTeamMessageRead | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select(READ_COLUMNS)
      .from(rfpTeamMessageReads)
      .where(and(
        eq(rfpTeamMessageReads.rfpId, rfpId),
        eq(rfpTeamMessageReads.workspaceId, workspaceId),
        eq(rfpTeamMessageReads.userId, userId),
      ))
      .limit(1);
    return row ?? undefined;
  }
}
```

- [ ] **Step 7: factory 등록** — `lib/server/repositories/factory.ts`:
  1. import 타입 목록(약 14–24행)에 `RfpTeamMessageReadRepo` 추가.
  2. `RepoBundle` 타입(약 50행 `rfpTeamMessage` 다음)에 `rfpTeamMessageRead: RfpTeamMessageReadRepo;` 추가.
  3. `createRepoBundle` 의 dynamic import 묶음에 추가:
     ```ts
     const { DrizzleRfpTeamMessageReadRepository } = await import('./drizzle/rfp-team-message-read');
     ```
  4. return 객체에 `rfpTeamMessage` 다음 줄: `rfpTeamMessageRead: new DrizzleRfpTeamMessageReadRepository(db),`
  5. 파일 하단 getter 묶음에 추가:
     ```ts
     export async function getRfpTeamMessageReadRepo(): Promise<RfpTeamMessageReadRepo> {
       return (await getBundle()).rfpTeamMessageRead;
     }
     ```

- [ ] **Step 8: GREEN 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-team-message-read.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: 커밋**

```bash
git add lib/db/schema/rfp-team-message-reads.ts lib/db/schema/index.ts \
  lib/server/repositories/drizzle/rfp-team-message-read.ts lib/server/repositories/types.ts \
  lib/server/repositories/factory.ts \
  lib/server/repositories/drizzle/__tests__/rfp-team-message-read.test.ts
git commit -m "feat(team-chat): rfp_team_message_reads 읽음상태 테이블·repo"
```

---

### Task 2: 워크스페이스 전역 팀 스레드 집계 (`listThreadsForWorkspace`)

**Files:**
- Test: `lib/server/repositories/drizzle/__tests__/rfp-team-message.test.ts` (기존에 추가)
- Modify: `lib/server/repositories/types.ts`, `lib/server/repositories/drizzle/rfp-team-message.ts`

- [ ] **Step 1: 실패 테스트 추가** — 기존 `rfp-team-message.test.ts` 의 describe 안에 추가:

```ts
it('listThreadsForWorkspace aggregates one summary per rfp with its last message', async () => {
  const u = await seedUser(db, { email: 'u@b.com', name: 'U' });
  const ws = await seedBuyerWorkspace(db);
  const rfpA = await seedRfp(db, { buyerWsId: ws.id, createdBy: u.id });
  const rfpB = await seedRfp(db, { buyerWsId: ws.id, createdBy: u.id });
  const repo = new DrizzleRfpTeamMessageRepository(db);
  await repo.save({ id: randomUUID(), rfpId: rfpA.id, workspaceId: ws.id, authorUserId: u.id, body: 'A1', createdAt: new Date('2026-06-14T00:00:00Z') });
  await repo.save({ id: randomUUID(), rfpId: rfpA.id, workspaceId: ws.id, authorUserId: u.id, body: 'A2-last', createdAt: new Date('2026-06-14T02:00:00Z') });
  await repo.save({ id: randomUUID(), rfpId: rfpB.id, workspaceId: ws.id, authorUserId: u.id, body: 'B1-last', createdAt: new Date('2026-06-14T01:00:00Z') });

  const summaries = await repo.listThreadsForWorkspace(ws.id);
  expect(summaries).toHaveLength(2);
  const a = summaries.find((s) => s.rfpId === rfpA.id)!;
  expect(a.lastBody).toBe('A2-last');
  expect(a.lastMessageAt.toISOString()).toBe('2026-06-14T02:00:00.000Z');
  // 다른 워크스페이스 스레드는 제외된다.
  const otherWs = await seedBuyerWorkspace(db);
  expect(await repo.listThreadsForWorkspace(otherWs.id)).toHaveLength(0);
});
```

(파일 상단에 `import { randomUUID } from 'node:crypto';` 와 `seedRfp` import 가 없으면 추가.)

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-team-message.test.ts`
Expected: FAIL — `repo.listThreadsForWorkspace is not a function`.

- [ ] **Step 3: 인터페이스 + 타입** — `lib/server/repositories/types.ts` `RfpTeamMessageRepo` 인터페이스에 추가하고, 위에 `TeamThreadSummary` 타입 추가:

```ts
export type TeamThreadSummary = {
  rfpId: string;
  lastMessageAt: Date;
  lastBody: string;
  lastAuthorUserId: string;
};
// RfpTeamMessageRepo 인터페이스 내부:
  /** 워크스페이스가 메시지를 남긴 모든 RFP 의 스레드 요약(rfp별 마지막 메시지). */
  listThreadsForWorkspace(workspaceId: string, tx?: Tx): Promise<TeamThreadSummary[]>;
```

- [ ] **Step 4: Drizzle 구현** — `lib/server/repositories/drizzle/rfp-team-message.ts` 클래스에 메서드 추가(상단 import 에 `desc`, `sql` 추가; `TeamThreadSummary` 타입 import):

```ts
  async listThreadsForWorkspace(workspaceId: string, tx?: Tx): Promise<TeamThreadSummary[]> {
    const db = this.h(tx);
    // rfp별 마지막 메시지: created_at DESC 정렬 후 DISTINCT ON (rfp_id).
    const rows = (await db
      .selectDistinctOn([rfpTeamMessages.rfpId], {
        rfpId: rfpTeamMessages.rfpId,
        lastMessageAt: rfpTeamMessages.createdAt,
        lastBody: rfpTeamMessages.body,
        lastAuthorUserId: rfpTeamMessages.authorUserId,
      })
      .from(rfpTeamMessages)
      .where(eq(rfpTeamMessages.workspaceId, workspaceId))
      .orderBy(rfpTeamMessages.rfpId, desc(rfpTeamMessages.createdAt))) as TeamThreadSummary[];
    return rows;
  }
```

> 주의: `selectDistinctOn` 은 drizzle pg-core API. import 는 `import { ... } from 'drizzle-orm/pg-core'` 가 아니라 쿼리빌더 메서드이므로 `db.selectDistinctOn(...)` 형태로 호출된다(별도 import 불필요). `desc` 는 `drizzle-orm` 에서 import.

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-team-message.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/rfp-team-message.ts \
  lib/server/repositories/drizzle/__tests__/rfp-team-message.test.ts
git commit -m "feat(team-chat): listThreadsForWorkspace 워크스페이스 전역 스레드 집계"
```

---

### Task 3: `TeamChatService.markRead` + `listThreads`

**Files:**
- Test: `lib/server/services/__tests__/team-chat.test.ts` (기존이 있으면 추가, 없으면 생성)
- Modify: `lib/server/services/team-chat.ts`

- [ ] **Step 1: 실패 테스트** — markRead 가 read 행을 만들고, listThreads 가 unread 를 정확히 매기는지:

```ts
it('markRead then listThreads clears unread for own read; teammate message re-raises unread', async () => {
  // seed: buyer ws, two members (me, mate), one rfp, mate posts a team message.
  const me = await seedUser(db, { email: 'me@b.com', name: '나' });
  const mate = await seedUser(db, { email: 'mate@b.com', name: '동료' });
  const ws = await seedBuyerWorkspace(db);
  await seedMembership(db, ws.id, me.id, 'admin');
  await seedMembership(db, ws.id, mate.id, 'member');
  const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: me.id });
  const svc = buildTeamChatService(db); // factory-built or new TeamChatService(db, ...repos)
  const actorMe = { userId: me.id, workspaceId: ws.id, workspaceType: 'buyer' as const };

  await svc.sendMessage({ rfpId: rfp.id, body: '동료 메모' }, { userId: mate.id, workspaceId: ws.id, workspaceType: 'buyer' });

  let r = await svc.listThreads(actorMe);
  expect(r.ok && r.threads.find((t) => t.rfpId === rfp.id)?.unread).toBe(true);

  const mark = await svc.markRead(rfp.id, actorMe);
  expect(mark.ok).toBe(true);

  r = await svc.listThreads(actorMe);
  expect(r.ok && r.threads.find((t) => t.rfpId === rfp.id)?.unread).toBe(false);
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts`
Expected: FAIL — `svc.markRead is not a function` (또는 listThreads).

- [ ] **Step 3: 서비스 구현** — `lib/server/services/team-chat.ts`:
  1. import 에 `RfpTeamMessageReadRepo` 추가.
  2. 생성자에 `private readonly readRepo: RfpTeamMessageReadRepo` 인자 추가(맨 끝).
  3. `getTeamChatService` 의 repo 묶음에 `getRfpTeamMessageReadRepo` 추가하고 인스턴스에 전달.
  4. 클래스에 메서드 추가:

```ts
  async markRead(rfpId: string, actor: TeamChatActor): Promise<ServiceResult<{ readAt: string }>> {
    const auth = await this.authorize(rfpId, actor);
    if (!auth.ok) return auth;
    const at = new Date();
    await this.readRepo.upsert(rfpId, actor.workspaceId, actor.userId, at);
    return { ok: true, readAt: at.toISOString() };
  }

  async listThreads(actor: TeamChatActor): Promise<ServiceResult<{ threads: TeamThreadEntry[] }>> {
    const summaries = await this.msgRepo.listThreadsForWorkspace(actor.workspaceId);
    const entries = await Promise.all(
      summaries.map(async (s) => {
        const [rfp, read] = await Promise.all([
          this.rfpRepo.findById(s.rfpId),
          this.readRepo.getFor(s.rfpId, actor.workspaceId, actor.userId),
        ]);
        const lastReadAt = read?.lastReadAt ?? null;
        // 안읽음 = 마지막 메시지가 내 read 이후 AND 내가 작성한 게 아님.
        const unread =
          s.lastAuthorUserId !== actor.userId &&
          (lastReadAt === null || s.lastMessageAt > lastReadAt);
        return {
          rfpId: s.rfpId,
          rfpCode: rfp?.code ?? '',
          rfpTitle: rfp?.title ?? '',
          preview: s.lastBody.length > 0 ? s.lastBody : '첨부 파일',
          lastMessageAt: s.lastMessageAt.toISOString(),
          unread,
        } satisfies TeamThreadEntry;
      }),
    );
    return { ok: true, threads: entries };
  }
```

  5. 파일 상단에 `TeamThreadEntry` 타입 export(공유 타입 섹션 참조).

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/server/services/team-chat.ts lib/server/services/__tests__/team-chat.test.ts
git commit -m "feat(team-chat): TeamChatService.markRead·listThreads(unread 계산)"
```

---

### Task 4: 액션 — `markTeamThreadReadAction` + `listTeamThreadsForViewer` + `listInboxForViewer`

**Files:**
- Test: `lib/server/actions/chat/__tests__/inboxLoader.test.ts`
- Create: `lib/server/actions/chat/markTeamThreadReadAction.ts`, `lib/server/actions/chat/inboxLoader.ts`

- [ ] **Step 1: 실패 테스트** — `listInboxForViewer` 가 상대방+팀을 `kind`/`key` 로 병합하고 `lastMessageAt desc` 정렬하는지(액션 테스트 패턴: `setupRfpActionEnv`, `requireSession` mock, 시드):

```ts
it('merges counterparty conversations and team threads sorted by lastMessageAt desc', async () => {
  // 시드: buyer me, pg, conversation(상대방 메시지 t=03:00), team message(t=01:00)
  // requireSession → buyer. (구체 시드는 sendChatMessage.test.ts·sendTeamMessage.test.ts 헬퍼 재사용)
  const items = await listInboxForViewer();
  expect(items.map((i) => i.kind)).toEqual(['counterparty', 'team']); // 03:00 먼저, 01:00 다음
  expect(items[0].key).toBe(`c:${conversationId}`);
  expect(items[1].key).toBe(`t:${rfp.id}`);
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/actions/chat/__tests__/inboxLoader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: `markTeamThreadReadAction`** — `lib/server/actions/chat/markTeamThreadReadAction.ts`

```ts
'use server';
import { z } from 'zod';
import { getTeamChatService } from '@/lib/server/services/team-chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.object({ rfpId: z.string().uuid() }).strict();
export type MarkTeamThreadReadResult = ChatActionResult<{ readAt: string }>;

export async function markTeamThreadReadAction(
  input: z.infer<typeof Input>,
): Promise<MarkTeamThreadReadResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  const service = await getTeamChatService();
  return service.markRead(parsed.data.rfpId, {
    userId: ws.userId, workspaceId: ws.workspaceId, workspaceType: ws.workspaceType,
  });
}
```

- [ ] **Step 4: `inboxLoader.ts`** — `lib/server/actions/chat/inboxLoader.ts`

```ts
'use server';
import { getTeamChatService } from '@/lib/server/services/team-chat';
import { listConversationsForViewer, type ConversationListItem } from './conversationLoaders';
import { requireActiveWorkspace } from './_shared';

export type InboxListItem =
  | ({ kind: 'counterparty'; key: string } & ConversationListItem)
  | { kind: 'team'; key: string; rfpId: string; rfpCode: string; rfpTitle: string; preview: string; lastMessageAt: string | null; unread: boolean };

/** 세션 워크스페이스의 팀 스레드 목록(통합 인박스 'team' 항목). */
export async function listTeamThreadsForViewer(): Promise<Extract<InboxListItem, { kind: 'team' }>[]> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return [];
  const service = await getTeamChatService();
  const r = await service.listThreads({ userId: ws.userId, workspaceId: ws.workspaceId, workspaceType: ws.workspaceType });
  if (!r.ok) return [];
  return r.threads.map((t) => ({
    kind: 'team' as const,
    key: `t:${t.rfpId}`,
    rfpId: t.rfpId,
    rfpCode: t.rfpCode,
    rfpTitle: t.rfpTitle,
    preview: t.preview,
    lastMessageAt: t.lastMessageAt,
    unread: t.unread,
  }));
}

/** 상대방 대화 + 팀 스레드 통합 목록 — lastMessageAt desc(null 후순위). */
export async function listInboxForViewer(): Promise<InboxListItem[]> {
  const [conversations, teamThreads] = await Promise.all([
    listConversationsForViewer(),
    listTeamThreadsForViewer(),
  ]);
  const counterparty: InboxListItem[] = conversations.map((c) => ({
    kind: 'counterparty' as const, key: `c:${c.conversationId}`, ...c,
  }));
  const all = [...counterparty, ...teamThreads];
  all.sort((a, b) => {
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : -Infinity;
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : -Infinity;
    return tb - ta;
  });
  return all;
}
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test lib/server/actions/chat/__tests__/inboxLoader.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add lib/server/actions/chat/markTeamThreadReadAction.ts lib/server/actions/chat/inboxLoader.ts \
  lib/server/actions/chat/__tests__/inboxLoader.test.ts
git commit -m "feat(inbox): listInboxForViewer 통합 로더 + markTeamThreadReadAction"
```

---

### Task 5: `loadConversationThread` 가 `rfpById` 반환 (RFP 칩 복원)

**Files:**
- Test: `lib/server/actions/chat/__tests__/conversationLoaders.test.ts` (기존에 추가)
- Modify: `lib/server/actions/chat/conversationLoaders.ts`, `components/messages/ThreadPane.tsx`, `components/messages/ChatPanel.tsx`

- [ ] **Step 1: 실패 테스트** — 스레드에 rfpId 가 있는 메시지가 있으면 `rfpById[rfpId] = {code,title}` 가 채워지는지:

```ts
it('loadConversationThread returns rfpById map for rfpIds present in the thread', async () => {
  // 시드: conversation, rfp(code 'P-2605-0042', title '제목'), message rfpId=rfp.id
  const r = await loadConversationThread(conversationId);
  expect(r.ok && r.rfpById[rfp.id]).toEqual({ code: 'P-2605-0042', title: '제목' });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/actions/chat/__tests__/conversationLoaders.test.ts`
Expected: FAIL — `r.rfpById` undefined.

- [ ] **Step 3: 로더 구현** — `lib/server/actions/chat/conversationLoaders.ts`:
  1. `LoadThreadResult` 의 객체에 `rfpById: Record<string, { code: string; title: string }>;` 추가.
  2. import 에 `getRfpRepo` 추가.
  3. `loadConversationThread` 의 `messages` 계산 직후, return 전에:

```ts
  const rfpRepo = await getRfpRepo();
  const distinctRfpIds = [...new Set(rows.map((m) => m.rfpId).filter((x): x is string => !!x))];
  const rfpRows = await Promise.all(distinctRfpIds.map((id) => rfpRepo.findById(id)));
  const rfpById: Record<string, { code: string; title: string }> = {};
  rfpRows.forEach((rfp) => { if (rfp) rfpById[rfp.id] = { code: rfp.code, title: rfp.title }; });
```

  4. return 객체에 `rfpById,` 추가.

- [ ] **Step 4: ThreadPane 가 로더 rfpById 사용** — `components/messages/ThreadPane.tsx`:
  - props 에서 `rfpById` 제거(이제 로더에서 도출), `defaultRfpId`·`variant`·`sendDisabled` 는 유지.
  - 본문:
    ```ts
    const rfpById = result.ok ? result.rfpById : undefined;
    // <ThreadView ... rfpById={rfpById} defaultRfpId={defaultRfpId} ... />
    ```

- [ ] **Step 5: ChatPanel 에서 rfpById prop 제거** — `components/messages/ChatPanel.tsx` 의 `<ThreadPane ... rfpById={{ [rfpId]: { code: rfpCode, title: rfpTitle } }} ...>` 에서 `rfpById` 줄을 삭제(`defaultRfpId={rfpId}`·`variant="rail"`·`sendDisabled` 는 유지).

- [ ] **Step 6: GREEN 확인 + 회귀**

Run: `pnpm test lib/server/actions/chat/__tests__/conversationLoaders.test.ts components/messages/__tests__/ThreadView.test.tsx`
Expected: PASS (스레드 뷰 칩 렌더는 이제 /messages 에서도 동작).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/actions/chat/conversationLoaders.ts components/messages/ThreadPane.tsx \
  components/messages/ChatPanel.tsx lib/server/actions/chat/__tests__/conversationLoaders.test.ts
git commit -m "feat(inbox): loadConversationThread rfpById → /messages RFP 칩 복원"
```

---

### Task 6: 통합 인박스 UI — 필터 칩 + 팀 행 + 스레드 라우팅 + `?t`

**Files:**
- Test: `components/messages/__tests__/MessageInbox.test.tsx` (기존에 추가)
- Create: `components/messages/TeamThreadPane.tsx`
- Modify: `components/messages/types.ts`, `components/messages/ConversationList.tsx`, `components/messages/MessageInbox.tsx`, `app/(app)/messages/page.tsx`

- [ ] **Step 1: 실패 테스트** — 필터 칩 동작 + 팀 항목 렌더 + 팀 항목 선택 시 팀 스레드 진입:

```ts
it('renders 전체/상대방/팀 filter chips and filters the list', async () => {
  const items = [
    { kind: 'counterparty', key: 'c:c1', conversationId: 'c1', counterparty: { workspaceId: 'w', name: '토스', type: 'pg', hasLogo: false }, rfpId: null, preview: '안녕', lastMessageAt: '2026-06-14T03:00:00Z', unread: false },
    { kind: 'team', key: 't:r1', rfpId: 'r1', rfpCode: 'P-2605-0042', rfpTitle: '제목', preview: '내부 메모', lastMessageAt: '2026-06-14T01:00:00Z', unread: true },
  ];
  render(<MessageInbox items={items} initialSelectedKey={null} />);
  expect(screen.getByText('토스')).toBeInTheDocument();
  expect(screen.getByText(/내부 메모/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: /팀/ }));
  expect(screen.queryByText('토스')).not.toBeInTheDocument();
  expect(screen.getByText(/내부 메모/)).toBeInTheDocument();
});
```

> 주의(메모리): 팀 행 라벨 '팀'·아바타 이니셜이 칩 이름과 겹칠 수 있으니 `getByRole('tab', { name: /팀/ })` 로 칩을 특정. cmdk 미사용. `userEvent` 사용.

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/messages/__tests__/MessageInbox.test.tsx`
Expected: FAIL — `MessageInbox` 가 `items`/`initialSelectedKey` prop 을 모름(현재는 `conversations`/`initialSelectedId`).

- [ ] **Step 3: 타입 re-export** — `components/messages/types.ts` 에 추가:

```ts
export type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';
```

- [ ] **Step 4: `TeamThreadPane`** — `components/messages/TeamThreadPane.tsx` (ChatPanel 내부 패턴을 standalone 으로):

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { TeamThreadView } from './TeamThreadView';
import { ThreadSkeleton } from './ThreadSkeleton';
import { getTeamThreadPromise, invalidateTeamThread } from './team-thread-cache';
import type { LoadTeamThreadResult } from '@/lib/server/actions/chat/teamThreadLoader';

export function TeamThreadPane({ rfpId }: { rfpId: string }) {
  const [result, setResult] = useState<LoadTeamThreadResult | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rfpId/재시도 변경 시 즉시 스켈레톤
    setResult(null);
    getTeamThreadPromise(rfpId).then((r) => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; invalidateTeamThread(rfpId); };
  }, [rfpId, retry]);
  if (!result) return <ThreadSkeleton />;
  if (!result.ok) {
    return (
      <EmptyState title="팀 채팅을 불러오지 못했어요" description="네트워크 상태를 확인하고 다시 시도해 주세요." className="py-12"
        action={<Button size="sm" onClick={() => { invalidateTeamThread(rfpId); setRetry((n) => n + 1); }}>다시 시도</Button>} />
    );
  }
  return <TeamThreadView rfpId={result.rfpId} workspaceId={result.workspaceId} viewerUserId={result.viewerUserId} messages={result.messages} />;
}
```

- [ ] **Step 5: `ConversationList` → `InboxListItem` 렌더** — `components/messages/ConversationList.tsx`:
  - props 를 `{ items: InboxListItem[]; selectedKey: string | null; onSelect: (key: string) => void }` 로 변경.
  - `key={item.key}`, `active = item.key === selectedKey`, `onClick={() => onSelect(item.key)}`.
  - kind 분기 렌더:
    - `counterparty`: 기존 `WorkspaceAvatar` + `item.counterparty.name` + preview + unread.
    - `team`: `Users` 아이콘 아바타 + 라벨 `팀 · {item.rfpCode}` (또는 `{item.rfpTitle}`) + preview + unread.

```tsx
// team 행 예시 (요지)
<span className="... flex size-9 items-center justify-center rounded-[var(--md-sys-shape-full)] bg-[var(--md-sys-color-surface-container-high)]">
  <Users size={16} className="text-[var(--md-sys-color-on-surface-variant)]" />
</span>
<span className="truncate text-[13px] font-medium ...">팀 · <span className="md-numeric">{item.rfpCode}</span> {item.rfpTitle}</span>
```

- [ ] **Step 6: `MessageInbox` 필터 + 라우팅** — `components/messages/MessageInbox.tsx`:
  - props: `{ items: InboxListItem[]; initialSelectedKey?: string | null; className?: string }`.
  - state: `selectedKey`, `filter: 'all' | 'counterparty' | 'team'`.
  - `Tabs` 프리미티브로 필터(`tabs=[{id:'all',label:'전체'},{id:'counterparty',label:'상대방'},{id:'team',label:'팀'}]`) — `role="tab"` 가 테스트 셀렉터.
  - `const visible = items.filter((i) => filter === 'all' || i.kind === filter)`.
  - `const selected = items.find((i) => i.key === selectedKey) ?? null`.
  - 스레드 페인: `selected?.kind === 'team'` → `<TeamThreadPane rfpId={selected.rfpId} />`; `counterparty` → 기존 `<ThreadPane conversationId={selected.conversationId} counterpartyFallback={selected.counterparty} onBack={...} />`.
  - `<ConversationList items={visible} selectedKey={selectedKey} onSelect={setSelectedKey} />`.

- [ ] **Step 7: `messages/page.tsx`** — `listInboxForViewer` + `?t`:

```tsx
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';
// ...
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ c?: string; t?: string }> }) {
  const [items, { c, t }] = await Promise.all([listInboxForViewer(), searchParams]);
  const unread = items.filter((i) => i.unread).length;
  const initialSelectedKey = t ? `t:${t}` : c ? `c:${c}` : null; // t·c 상호배타, 동시엔 c 우선은 아래 주석대로
  // 동시 존재 비정상 케이스는 c 우선: const initialSelectedKey = c ? `c:${c}` : t ? `t:${t}` : null;
  return (
    <PageEnter className="flex h-full flex-col">
      <PageHeader title="메시지" count={unread} />
      <MessageInbox items={items} initialSelectedKey={initialSelectedKey} className="min-h-0 flex-1" />
    </PageEnter>
  );
}
```

> 스펙 §4D 확정: `c` 우선. 위 한 줄을 `c ? ... : t ? ... : null` 로 작성.

- [ ] **Step 8: GREEN 확인**

Run: `pnpm test components/messages/__tests__/MessageInbox.test.tsx`
Expected: PASS. (기존 MessageInbox 테스트가 `conversations` prop 을 쓰면 `items` 로 갱신 — 메모리: 채팅 sender PR 때 mock 갱신 선례.)

- [ ] **Step 9: 커밋**

```bash
git add components/messages/TeamThreadPane.tsx components/messages/types.ts \
  components/messages/ConversationList.tsx components/messages/MessageInbox.tsx \
  "app/(app)/messages/page.tsx" components/messages/__tests__/MessageInbox.test.tsx
git commit -m "feat(inbox): 통합 목록 + 전체/상대방/팀 필터 + 팀 스레드 라우팅 + ?t 딥링크"
```

---

### Task 7: 팀 마운트 read + ChatPanel 팀 탭 링크 + home 위젯

**Files:**
- Test: `components/messages/__tests__/TeamThreadView.test.tsx`, `components/home/__tests__/RecentMessagesPanel.test.tsx` (기존에 추가)
- Modify: `components/messages/TeamThreadView.tsx`, `components/messages/ChatPanel.tsx`, `lib/server/dashboard/homeMessages.ts`, `components/home/RecentMessagesPanel.tsx`, `components/home/HomeDashboard.tsx`, `components/home/BuyerHome.tsx`, `components/home/PgHome.tsx`

- [ ] **Step 1: 실패 테스트 (마운트 read)** — `TeamThreadView` 마운트 시 `markTeamThreadReadAction({ rfpId })` 호출:

```ts
vi.mock('@/lib/server/actions/chat/markTeamThreadReadAction', () => ({
  markTeamThreadReadAction: vi.fn().mockResolvedValue({ ok: true, readAt: '2026-06-14T00:00:00Z' }),
}));
import { markTeamThreadReadAction } from '@/lib/server/actions/chat/markTeamThreadReadAction';

it('marks the team thread read on mount', () => {
  render(<TeamThreadView rfpId="r1" workspaceId="w1" viewerUserId="u1" messages={[]} />);
  expect(markTeamThreadReadAction).toHaveBeenCalledWith({ rfpId: 'r1' });
});
```

(useTeamChannel·sendTeamMessageAction mock 은 기존 TeamThreadView 테스트 설정 재사용.)

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/messages/__tests__/TeamThreadView.test.tsx`
Expected: FAIL — 호출 안 됨.

- [ ] **Step 3: 마운트 read 구현** — `components/messages/TeamThreadView.tsx`:
  - import: `import { markTeamThreadReadAction } from '@/lib/server/actions/chat/markTeamThreadReadAction';`
  - 컴포넌트 본문에 effect 추가(`markConversationReadAction` 패턴):

```ts
  useEffect(() => { void markTeamThreadReadAction({ rfpId }); }, [rfpId]);
```

- [ ] **Step 4: ChatPanel 팀 탭 링크** — `components/messages/ChatPanel.tsx` 의 팀 탭 분기(`<TeamThreadPane rfpId={rfpId} />`)를 감싸 하단에 링크 추가(상대방 탭의 "메시지함에서 열기" 블록을 미러, href 만 `?t`):

```tsx
<div className="flex min-h-0 flex-1 flex-col">
  <div className="min-h-0 flex-1"><TeamThreadPane rfpId={rfpId} /></div>
  <div className="flex shrink-0 justify-end border-t border-[var(--md-sys-color-outline-variant)] px-3 py-1.5">
    <Link href={`/messages?t=${rfpId}`} className="inline-flex items-center gap-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-on-surface)]">
      메시지함에서 열기 <ChevronRightIcon size={13} />
    </Link>
  </div>
</div>
```

(ChatPanel 의 내부 `TeamThreadPane` 를 Task 6 의 standalone 으로 교체하거나 기존 내부 정의를 유지 — import 일관성만 맞추면 됨.)

- [ ] **Step 5: 실패 테스트 (home 팀 행)** — `RecentMessagesPanel` 가 팀 항목을 `/messages?t=` 로 딥링크:

```ts
it('renders a team thread row deep-linking to /messages?t=<rfpId>', () => {
  render(<RecentMessagesPanel items={[{ kind: 'team', key: 't:r1', rfpId: 'r1', rfpCode: 'P-1', rfpTitle: '제목', preview: '메모', lastMessageAt: '2026-06-14T01:00:00Z', unread: true }]} unreadCount={1} />);
  expect(screen.getByRole('link', { name: /제목|메모|팀/ })).toHaveAttribute('href', '/messages?t=r1');
});
```

- [ ] **Step 6: home 통합** —
  1. `lib/server/dashboard/homeMessages.ts`: `buildHomeMessagesSnapshot(items: InboxListItem[])` 로 시그니처 변경, `conversations` → `items` 필드명(아래 패널과 합의), `unreadCount = items.filter(i => i.unread).length`, 미리보기 필터는 `i.lastMessageAt !== null`.
  2. `components/home/RecentMessagesPanel.tsx`: props `items: InboxListItem[]`, row 를 kind 분기(counterparty=WorkspaceAvatar+`?c`, team=Users 아이콘+`?t`). `key`/`unread`/`lastMessageAt` 공통.
  3. `components/home/HomeDashboard.tsx`: prop 타입 `conversations: ConversationListItem[]` → `items: InboxListItem[]`, `<RecentMessagesPanel items={items} .../>`.
  4. `BuyerHome.tsx`·`PgHome.tsx`: `listConversationsForViewer` → `listInboxForViewer`, 변수명 갱신.

- [ ] **Step 7: GREEN 확인**

Run: `pnpm test components/messages/__tests__/TeamThreadView.test.tsx components/home/__tests__/RecentMessagesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 8: STAGE 1 통합 확인 + 커밋**

Run: `pnpm tsc --noEmit && pnpm test`
Expected: tsc 0, 전체 그린(플레이크는 단독 재실행으로 확인).

```bash
git add components/messages/TeamThreadView.tsx components/messages/ChatPanel.tsx \
  lib/server/dashboard/homeMessages.ts components/home/RecentMessagesPanel.tsx \
  components/home/HomeDashboard.tsx components/home/BuyerHome.tsx components/home/PgHome.tsx \
  components/messages/__tests__/TeamThreadView.test.tsx components/home/__tests__/RecentMessagesPanel.test.tsx
git commit -m "feat(inbox): 팀 스레드 마운트 read + ChatPanel 팀 탭 링크 + home 위젯 통합"
```

---

# STAGE 2 — 알림 풀 패리티

### Task 8: 팀 메시지 인앱 알림 팬아웃

**Files:**
- Test: `lib/server/services/__tests__/team-chat.test.ts` (추가)
- Modify: `lib/server/repositories/types.ts`, `lib/server/repositories/drizzle/notification.ts`, `lib/server/services/team-chat.ts`

- [ ] **Step 1: 실패 테스트** — 팀 메시지 전송 시 작성자를 제외한 같은 워크스페이스 멤버에게 인앱 알림 1건 생성, 같은 윈도 재전송은 dedupe:

```ts
it('fans out one inapp notification to teammates (not author) on send, deduped within window', async () => {
  // seed: ws with me(author) + mate; rfp. send two team messages in same window.
  await svc.sendMessage({ rfpId: rfp.id, body: '메모1' }, actorMe);
  await svc.sendMessage({ rfpId: rfp.id, body: '메모2' }, actorMe);
  const mateNotifs = await notifRepo.listForUser(mate.id, ws.id); // helper or direct db query
  const teamNotifs = mateNotifs.filter((n) => n.type === 'team_chat.message');
  expect(teamNotifs).toHaveLength(1);              // deduped
  const authorNotifs = (await notifRepo.listForUser(me.id, ws.id)).filter((n) => n.type === 'team_chat.message');
  expect(authorNotifs).toHaveLength(0);            // author excluded
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts`
Expected: FAIL — 알림 0건.

- [ ] **Step 3: `NotificationRepo.hasPendingTeamNotification`** — `lib/server/repositories/types.ts` 인터페이스 + `lib/server/repositories/drizzle/notification.ts` 구현(기존 `hasPendingChatNotification` 미러, `linkUrl='/messages?t=<rfpId>'` + `type='team_chat.message'` 매칭):

```ts
// types.ts (NotificationRepo)
  /** 동일 window 내 pending team_chat 인앱 알림 존재 여부(rfp 단위 dedupe). */
  hasPendingTeamNotification(userId: string, rfpId: string, windowStart: Date, tx?: Tx): Promise<boolean>;
```

```ts
// drizzle/notification.ts
  async hasPendingTeamNotification(userId: string, rfpId: string, windowStart: Date, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const [row] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'team_chat.message'),
        eq(notifications.linkUrl, `/messages?t=${rfpId}`),
        eq(notifications.status, 'pending'),
        gte(notifications.createdAt, windowStart),
      ))
      .limit(1);
    return !!row;
  }
```

(import `gte` from drizzle-orm 필요.)

- [ ] **Step 4: 서비스 팬아웃** — `lib/server/services/team-chat.ts`:
  1. 생성자에 `wsRepo: WorkspaceRepo`, `notifRepo: NotificationRepo` dep 추가; `getTeamChatService` 에서 `getWorkspaceRepo`·`getNotificationRepo` 전달.
  2. import: `dispatchNotification`, `emitAfterCommit` (`@/lib/server/notifications/dispatch`), `Notification` 타입, `chatDigestBucket`·`CHAT_DIGEST_WINDOW_MS` (`../actions/chat/_shared`), `randomUUID`.
  3. `sendMessage` 의 트랜잭션 commit 성공 후(메시지 저장 직후, tx 내부에서 알림 insert): 트랜잭션 콜백 내에서 수신자 조회 + `dispatchNotification`, commit 후 `emitAfterCommit`. ChatService 패턴을 따라 `pendingEmits` 배열 사용:

```ts
// 트랜잭션 콜백 안, 메시지 save 직후:
const now = createdAt;
const windowStart = new Date(chatDigestBucket(now) * CHAT_DIGEST_WINDOW_MS);
const members = await this.wsRepo.memberUserIds(actor.workspaceId); // 기존 메서드
for (const memberId of members) {
  if (memberId === actor.userId) continue;
  const already = await this.notifRepo.hasPendingTeamNotification(memberId, input.rfpId, windowStart, tx);
  if (already) continue;
  const notif: Notification = {
    id: randomUUID(), userId: memberId, workspaceId: actor.workspaceId,
    type: 'team_chat.message', title: `${authorNameForNotif}님의 팀 메시지`,
    body: body.length > 0 ? body.slice(0, 120) : '첨부 파일',
    channel: 'inapp', status: 'pending', linkUrl: `/messages?t=${input.rfpId}`,
    createdAt: now.toISOString(),
  };
  await dispatchNotification(tx, notif);
  pendingEmits.push(notif);
}
```

  4. tx 성공 후: `emitAfterCommit(pendingEmits);` (이메일 outbox 는 Task 9 에서 추가).
  5. `authorNameForNotif` 는 tx 전에 `this.userRepo.findById(actor.userId)` 로 확보(기존 sendMessage 가 마지막에 author 조회 — 알림용으로 앞당김).

> 주의: `memberUserIds` 메서드명이 WorkspaceRepo 에 있는지 확인(`loadConversationThread` 가 `wsRepo.memberUserIds` 사용 — 존재). 없으면 `isMember`/멤버 조회 메서드로 대체.

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/notification.ts \
  lib/server/services/team-chat.ts lib/server/services/__tests__/team-chat.test.ts
git commit -m "feat(team-chat): 팀 메시지 인앱 알림 팬아웃(멤버−작성자, 윈도 dedupe)"
```

---

### Task 9: 팀 메시지 이메일 다이제스트

**Files:**
- Test: `lib/server/outbox/__tests__/team-chat-digest-flush.test.ts`, `lib/server/repositories/drizzle/__tests__/outbox.test.ts` (추가)
- Modify: `lib/db/schema/_enums.ts`, `lib/server/outbox/types.ts`, `lib/server/actions/chat/_shared.ts`, `lib/server/repositories/drizzle/outbox.ts`, `lib/server/services/team-chat.ts`, `app/api/cron/flush-outbox/route.ts`
- Create: `lib/server/outbox/team-chat-digest-flush.ts`

- [ ] **Step 1: 이벤트 enum 추가** — `lib/db/schema/_enums.ts` 의 `outboxEventEnum` 배열 끝에 `'team_chat.message',` 추가. `lib/server/outbox/types.ts` 의 `OutboxEvent` 유니온에 `| 'team_chat.message'` 추가.

- [ ] **Step 2: digest 키 헬퍼** — `lib/server/actions/chat/_shared.ts` 에 추가(`chatDigestBucket`/`chatDigestWindowEnd` 재사용):

```ts
/** 팀 다이제스트 dedupe 키: `team-digest:<rfpId>:<workspaceId>:<recipientUserId>:<bucket>`. */
export function teamDigestDedupeKey(rfpId: string, workspaceId: string, recipientUserId: string, now: Date = new Date()): string {
  return `team-digest:${rfpId}:${workspaceId}:${recipientUserId}:${chatDigestBucket(now)}`;
}
export function parseTeamDigestDedupeKey(dedupeKey: string | undefined): { rfpId: string; workspaceId: string; recipientUserId: string } | null {
  if (!dedupeKey) return null;
  const parts = dedupeKey.split(':');
  if (parts.length !== 5 || parts[0] !== 'team-digest') return null;
  const [, rfpId, workspaceId, recipientUserId] = parts;
  if (!rfpId || !workspaceId || !recipientUserId) return null;
  return { rfpId, workspaceId, recipientUserId };
}
```

- [ ] **Step 3: outbox repo — `dueTeamChatDigests` + 제네릭 제외** — `lib/server/repositories/drizzle/outbox.ts`:
  - `pending()`(약 90행)·`flush()`(약 212행)의 `ne(outboxEntries.event, 'chat.message')` 옆에 `and(...)` 로 `ne(outboxEntries.event, 'team_chat.message')` 추가.
  - `dueChatDigests` 를 미러한 `dueTeamChatDigests(limit, tx?)` 추가(`eq(event, 'team_chat.message')` + `scheduledAt <= now()` + asc).

- [ ] **Step 4: 실패 테스트 (processor)** — `lib/server/outbox/__tests__/team-chat-digest-flush.test.ts`: due 행 1건 → 수신자 미읽음이면 recompute 후 sender 호출, 모두 읽었으면 cancel:

```ts
it('sends a recomputed team digest when recipient has unread team messages', async () => {
  // seed ws+rfp, mate posts team message, enqueue team-digest row for me, me has no read.
  const sender = vi.fn().mockResolvedValue({ ok: true });
  const r = await flushTeamChatDigests(sender, 50);
  expect(r.sent).toBe(1);
  expect(sender).toHaveBeenCalledOnce();
});
```

- [ ] **Step 5: RED 확인**

Run: `pnpm test lib/server/outbox/__tests__/team-chat-digest-flush.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: processor 구현** — `lib/server/outbox/team-chat-digest-flush.ts` (`chat-digest-flush.ts` 미러; conversation 대신 (rfp, ws) 스코프):

```ts
import { getOutboxRepo, getRfpTeamMessageRepo, getRfpTeamMessageReadRepo, getUserRepo } from '@/lib/server/repositories/factory';
import { parseTeamDigestDedupeKey } from '@/lib/server/actions/chat/_shared';
import { baseUrlFor } from '@/lib/server/env';
import { renderChatMessage } from './templates/chatMessage';
import type { Sender } from './types';

const PREVIEW_LEN = 120;

export async function flushTeamChatDigests(sender: Sender, limit = 50): Promise<{ sent: number; cancelled: number; failed: number }> {
  const outbox = await getOutboxRepo();
  const msgRepo = await getRfpTeamMessageRepo();
  const readRepo = await getRfpTeamMessageReadRepo();
  const userRepo = await getUserRepo();
  const due = await outbox.dueTeamChatDigests(limit);
  let sent = 0, cancelled = 0, failed = 0;
  for (const entry of due) {
    const parsed = parseTeamDigestDedupeKey(entry.dedupeKey);
    if (!parsed) { await outbox.markResult(entry.id, { ok: true }); cancelled++; continue; }
    const { rfpId, workspaceId, recipientUserId } = parsed;
    const read = await readRepo.getFor(rfpId, workspaceId, recipientUserId);
    const lastReadAt = read?.lastReadAt;
    const messages = await msgRepo.listByScope(rfpId, workspaceId);
    const unread = messages.filter((m) => m.authorUserId !== recipientUserId && (!lastReadAt || new Date(m.createdAt) > lastReadAt));
    if (unread.length === 0) { await outbox.markResult(entry.id, { ok: true }); cancelled++; continue; }
    const latest = unread[unread.length - 1];
    const preview = latest.body.length > 0 ? latest.body.slice(0, PREVIEW_LEN) : '첨부 파일';
    const senderName = latest.authorName ?? '팀원';
    // 수신자 side 는 workspaceId 로 결정되지 않으므로 buyer/pg origin 은 메시지 스코프 ws 타입으로 — 단순화: buyer origin 기본, partner 는 ws.type 조회 시 분기.
    const html = await renderChatMessage({ senderName, preview, conversationUrl: `${baseUrlFor('buyer')}/messages?t=${rfpId}`, count: unread.length });
    const subject = unread.length >= 2 ? `[Supporter B] ${senderName}님의 팀 메시지 ${unread.length}건` : `[Supporter B] ${senderName}님의 팀 메시지`;
    const result = await sender({ ...entry, subject, html });
    if (result.ok) { await outbox.markResult(entry.id, { ok: true }); sent++; }
    else { await outbox.markResult(entry.id, { ok: false, error: result.error ?? 'unknown' }); failed++; }
  }
  return { sent, cancelled, failed };
}
```

> origin(buyer vs partner)은 workspaceId 의 타입에 따라 달라지므로, 정확성을 위해 `getWorkspaceRepo().findById(workspaceId)` 로 `type` 을 조회해 `baseUrlFor(ws.type)` 로 분기(위 단순화 주석을 실제 구현에서 교체).

- [ ] **Step 7: 전송 시 이메일 enqueue** — `lib/server/services/team-chat.ts` `sendMessage` 의 수신자 루프(Task 8)에 이메일 outbox enqueue 추가(작성자 제외, presence 무관하게 enqueue — processor 가 read 로 취소). `outboxRepo` dep + `teamDigestDedupeKey`·`chatDigestWindowEnd` import:

```ts
  await this.outboxRepo.enqueue({
    event: 'team_chat.message', to: memberEmail, // members 조회를 (userId,email) 로 확장
    subject: `[Supporter B] 팀 메시지`, html: '', // body 는 processor 가 recompute (placeholder)
    dedupeKey: teamDigestDedupeKey(input.rfpId, actor.workspaceId, memberId, now),
    scheduledAt: chatDigestWindowEnd(now),
  }, tx);
```

(멤버 조회를 `memberUserIds` → email 포함 쿼리로 확장하거나 `userRepo.findById(memberId)` 로 email 확보.)

- [ ] **Step 8: cron 배선** — `app/api/cron/flush-outbox/route.ts` 에서 `flushChatDigests` 호출 옆에 `flushTeamChatDigests(getResendSender())` 추가(동일 sender·동일 auth 게이트).

- [ ] **Step 9: GREEN 확인**

Run: `pnpm test lib/server/outbox/__tests__/team-chat-digest-flush.test.ts lib/server/services/__tests__/team-chat.test.ts lib/server/repositories/drizzle/__tests__/outbox.test.ts`
Expected: PASS.

- [ ] **Step 10: 커밋**

```bash
git add lib/db/schema/_enums.ts lib/server/outbox/types.ts lib/server/actions/chat/_shared.ts \
  lib/server/repositories/drizzle/outbox.ts lib/server/outbox/team-chat-digest-flush.ts \
  lib/server/services/team-chat.ts "app/api/cron/flush-outbox/route.ts" \
  lib/server/outbox/__tests__/team-chat-digest-flush.test.ts
git commit -m "feat(team-chat): 팀 메시지 이메일 다이제스트(team_chat.message 이벤트·전용 프로세서)"
```

---

### Task 10: 문서 갱신 (v1 주석 + SCREEN_DESIGN)

**Files:** `lib/server/services/team-chat.ts`, `lib/db/schema/rfp-team-messages.ts`, `lib/server/actions/chat/sendTeamMessageAction.ts`, `SCREEN_DESIGN.md`

- [ ] **Step 1: 주석 갱신** — 세 파일의 "v1: no mentions/notifications/read-state — 확정 결정" 문구를 현실에 맞게 수정. 예시(team-chat.ts):

```ts
// RFP-scoped internal team thread. 읽음상태(rfp_team_message_reads)·안읽음·
// 알림(인앱+이메일 다이제스트, ChatService 패턴 미러)을 제공한다. 멘션은 아직
// 미지원. 통합 메시지함(/messages)에 listThreads 로 노출된다.
```

(rfp-team-messages.ts 의 "(v1: no mentions/notifications/read-state/attachments)" 도 동일 취지로 수정 — 첨부는 PR#183 에서, 읽음/알림은 본 PR 에서 추가됨.)

- [ ] **Step 2: SCREEN_DESIGN.md** — 메시지함(/messages) 섹션에 통합 목록 + `[전체|상대방|팀]` 필터 + 팀 스레드(읽음/안읽음/알림 패리티) + `?t` 딥링크를 기술.

- [ ] **Step 3: 전체 그린 확인**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: tsc 0, lint 0, 전체 그린.

- [ ] **Step 4: 커밋**

```bash
git add lib/server/services/team-chat.ts lib/db/schema/rfp-team-messages.ts \
  lib/server/actions/chat/sendTeamMessageAction.ts SCREEN_DESIGN.md
git commit -m "docs(team-chat): v1 '알림 없음' 주석 갱신 + SCREEN_DESIGN 메시지함 IA"
```

---

## 배포 노트

- **DDL(additive 1건)**: `rfp_team_message_reads` 테이블. 운영 배포 SQL 은 PR 본문에 첨부(공유 5432 push 금지).
- **outbox enum**: `outbox_event` 에 `team_chat.message` 값 추가(`ALTER TYPE outbox_event ADD VALUE 'team_chat.message';`) — PR 본문 SQL 에 포함. enum 값 추가는 트랜잭션 밖에서 실행해야 할 수 있으니 운영 적용 시 주의.
- **cron**: `flush-outbox` 라우트가 팀 다이제스트도 처리하므로 별도 스케줄 추가 불필요.
- **backfill 불필요**: 기존 팀 스레드는 read 행이 없어 첫 진입 시 안읽음 표시 후 mark-read 로 정리.

## Self-Review 메모 (작성자 확인 완료)

- 스펙 §A–F 각 항목 → Task 1–9 매핑 완료(§A=T1, §B=T2·T4, §C=T5·T6, §D=T6·T7, §E=T8·T9, §F=기존 useTeamChannel 재사용=무변경, §9 문서=T10).
- 타입 일관성: `RfpTeamMessageRead`·`TeamThreadSummary`·`TeamThreadEntry`·`InboxListItem`·`team_chat.message`·`teamDigestDedupeKey(rfp,ws,user)` 전 태스크 동일 사용.
- 미해결 확인 포인트(구현 중 검증): `WorkspaceRepo.memberUserIds` 존재(loadConversationThread 사용처로 확인됨), `seed*` 헬퍼 시그니처, 기존 MessageInbox/RecentMessagesPanel 테스트의 prop 갱신 범위.
