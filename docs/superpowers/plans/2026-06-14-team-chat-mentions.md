# 팀 채팅 `@` 멘션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RFP 팀 채팅에서 `@`로 팀원/전체(`@전체`)를 멘션하고, 멘션된 사람에게 전용 인앱 알림을 보내며, 메시지에 멘션을 강조 표시한다.

**Architecture:** 멘션은 `body` 안 구조화 토큰(`<@uuid>` / `<@all>`)으로 저장되는 단일 진실 원천이다. 팬아웃·렌더·미리보기 모두 토큰에서 파생한다. 순수 유틸(`lib/team-mentions.ts`)과 컴포저 로직(`components/messages/mention-input.ts`)은 무의존 순수 함수로 TDD한다. 서버는 최종 `body`에서 멘션을 재도출해 워크스페이스 멤버십을 검증한 뒤 알림을 분기한다. **마이그레이션 없음**(`notifications.type`은 `text`, 이메일은 기존 `team_chat.message` outbox 이벤트 재사용).

**Tech Stack:** Next.js App Router, Drizzle + Postgres(PGlite 단위테스트), Vitest, React 19, `es-hangul`(초성 검색), Tailwind v4 + Linear 토큰.

**Spec:** `docs/superpowers/specs/2026-06-14-team-chat-mentions-design.md`

---

## File Structure

신규:
- `lib/team-mentions.ts` — 순수 토큰 유틸(parse/extract/toPlainText/serialize). 클라+서버 공용, `next-auth`/`server-only` import 금지.
- `lib/__tests__/team-mentions.test.ts`
- `components/messages/mention-input.ts` — 순수 컴포저 로직(detectMentionQuery/buildMentionItems/applyMentionSelection/resolveMentionsToBody).
- `components/messages/__tests__/mention-input.test.ts`
- `components/messages/MentionText.tsx` — 본문 토큰 → 강조 span 렌더(프레젠테이션).
- `components/messages/__tests__/MentionText.test.tsx`
- `components/messages/MentionDropdown.tsx` — 자동완성 드롭다운(프레젠테이션: 아바타 + 이름 + 동명이인 합류일자).
- `components/messages/__tests__/MentionDropdown.test.tsx`

수정:
- `lib/server/repositories/types.ts` — `TeamMember` 타입 + `WorkspaceRepo.teamRoster` + `NotificationRepo.hasPendingTeamMentionNotification`.
- `lib/server/repositories/drizzle/workspace.ts` — `teamRoster` 구현.
- `lib/server/repositories/drizzle/notification.ts` — `hasPendingTeamMentionNotification` 구현.
- `lib/server/services/team-chat.ts` — `listTeamMembers` 추가; `sendMessage` 멘션 팬아웃 분기; `listThreads` 미리보기 평문화.
- `lib/server/actions/chat/teamThreadLoader.ts` — 결과에 `teamMembers` 추가.
- `lib/server/outbox/team-chat-digest-flush.ts` — 이메일 본문 토큰 평문화.
- `components/messages/TeamThreadView.tsx` — `teamMembers` prop, 드롭다운 연결, 전송 시 토큰화, `MentionText`로 렌더.
- `components/messages/TeamThreadPane.tsx` — `teamMembers`를 뷰로 전달.

테스트 수정:
- `components/messages/__tests__/TeamThreadView.test.tsx` — `base()`에 `teamMembers` 추가(멘션 시나리오).
- `lib/server/repositories/drizzle/__tests__/_seed.ts` — `seedMembership`에 `joinedAt` 옵션(결정적 테스트용).

---

## Task 1: 순수 토큰 유틸 `lib/team-mentions.ts`

**Files:**
- Create: `lib/team-mentions.ts`
- Test: `lib/__tests__/team-mentions.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/team-mentions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseMentions,
  extractMentions,
  mentionsToPlainText,
  serializeMention,
  ALL_TOKEN,
} from '@/lib/team-mentions';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('serializeMention / ALL_TOKEN', () => {
  it('직렬화 형식', () => {
    expect(serializeMention(U1)).toBe(`<@${U1}>`);
    expect(ALL_TOKEN).toBe('<@all>');
  });
});

describe('parseMentions', () => {
  it('텍스트만이면 단일 text 세그먼트', () => {
    expect(parseMentions('안녕하세요')).toEqual([{ type: 'text', text: '안녕하세요' }]);
  });

  it('빈 문자열은 빈 배열', () => {
    expect(parseMentions('')).toEqual([]);
  });

  it('멘션 토큰을 mention 세그먼트로 분해', () => {
    expect(parseMentions(`<@${U1}> 확인해주세요`)).toEqual([
      { type: 'mention', userId: U1 },
      { type: 'text', text: ' 확인해주세요' },
    ]);
  });

  it('@all 토큰은 all 세그먼트', () => {
    expect(parseMentions(`다들 ${ALL_TOKEN} 보세요`)).toEqual([
      { type: 'text', text: '다들 ' },
      { type: 'all' },
      { type: 'text', text: ' 보세요' },
    ]);
  });

  it('여러 멘션 혼합', () => {
    expect(parseMentions(`<@${U1}> 와 <@${U2}>`)).toEqual([
      { type: 'mention', userId: U1 },
      { type: 'text', text: ' 와 ' },
      { type: 'mention', userId: U2 },
    ]);
  });

  it('토큰처럼 보이지만 형식이 다른 텍스트는 매칭하지 않는다', () => {
    expect(parseMentions('이메일 a@b 그리고 <@nope>')).toEqual([
      { type: 'text', text: '이메일 a@b 그리고 <@nope>' },
    ]);
  });
});

describe('extractMentions', () => {
  it('userId 집합과 all 플래그를 반환', () => {
    expect(extractMentions(`<@${U1}> <@${U2}> <@${U1}>`)).toEqual({
      userIds: [U1, U2],
      all: false,
    });
  });

  it('@all 이 있으면 all=true', () => {
    expect(extractMentions(`hi ${ALL_TOKEN}`)).toEqual({ userIds: [], all: true });
  });

  it('멘션 없으면 빈 결과', () => {
    expect(extractMentions('plain')).toEqual({ userIds: [], all: false });
  });
});

describe('mentionsToPlainText', () => {
  const names = new Map([[U1, '김민수'], [U2, '이영희']]);

  it('토큰을 @이름 으로 치환', () => {
    expect(mentionsToPlainText(`<@${U1}> 안녕`, names)).toBe('@김민수 안녕');
  });

  it('@all 은 @전체', () => {
    expect(mentionsToPlainText(`${ALL_TOKEN} 공지`, names)).toBe('@전체 공지');
  });

  it('알 수 없는 id 는 fallback', () => {
    expect(mentionsToPlainText(`<@${U2}>`, new Map())).toBe('@(알 수 없음)');
  });

  it('Record 형태도 허용', () => {
    expect(mentionsToPlainText(`<@${U1}>`, { [U1]: '김민수' })).toBe('@김민수');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/__tests__/team-mentions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/team-mentions'`.

- [ ] **Step 3: Write minimal implementation**

`lib/team-mentions.ts`:

```ts
// 팀 채팅 멘션 토큰 — `body` 안에 구조화 저장되는 단일 진실 원천(SSOT).
// `<@{uuid}>` = 개인 멘션, `<@all>` = 전체 멘션. 클라+서버 공용 순수 모듈
// (next-auth/server-only import 금지 — TeamThreadView, TeamChatService 양쪽이 import).

export const ALL_TOKEN = '<@all>';

export function serializeMention(userId: string): string {
  return `<@${userId}>`;
}

// uuid(v4 형태) 또는 리터럴 'all'. 새 RegExp 를 호출마다 생성해 global lastIndex 상태 공유를 피한다.
const MENTION_SOURCE =
  '<@(all|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>';

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; userId: string }
  | { type: 'all' };

export function parseMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const re = new RegExp(MENTION_SOURCE, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) segments.push({ type: 'text', text: body.slice(last, m.index) });
    segments.push(m[1] === 'all' ? { type: 'all' } : { type: 'mention', userId: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) segments.push({ type: 'text', text: body.slice(last) });
  return segments;
}

export function extractMentions(body: string): { userIds: string[]; all: boolean } {
  const ids: string[] = [];
  const seen = new Set<string>();
  let all = false;
  const re = new RegExp(MENTION_SOURCE, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1] === 'all') {
      all = true;
    } else if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return { userIds: ids, all };
}

export function mentionsToPlainText(
  body: string,
  nameById: Map<string, string> | Record<string, string>,
): string {
  const lookup = (id: string): string | undefined =>
    nameById instanceof Map ? nameById.get(id) : nameById[id];
  return parseMentions(body)
    .map((seg) => {
      if (seg.type === 'text') return seg.text;
      if (seg.type === 'all') return '@전체';
      const name = lookup(seg.userId);
      return name ? `@${name}` : '@(알 수 없음)';
    })
    .join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/__tests__/team-mentions.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/team-mentions.ts lib/__tests__/team-mentions.test.ts
git commit -m "feat: team-mentions pure token util (parse/extract/plaintext)"
```

---

## Task 2: `WorkspaceRepo.teamRoster`

**Files:**
- Modify: `lib/server/repositories/types.ts` (WorkspaceRepo interface + `TeamMember` 타입)
- Modify: `lib/server/repositories/drizzle/workspace.ts`
- Modify: `lib/server/repositories/drizzle/__tests__/_seed.ts` (`seedMembership` joinedAt 옵션)
- Test: `lib/server/repositories/drizzle/__tests__/workspace-roster.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/server/repositories/drizzle/__tests__/workspace-roster.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedUser, seedBuyerWorkspace, seedMembership } from './_seed';
import { users } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('DrizzleWorkspaceRepository.teamRoster', () => {
  it('워크스페이스 멤버를 {userId,name,joinedAt} 로 반환(시스템 계정 제외)', async () => {
    const repo = new DrizzleWorkspaceRepository(db);
    const ws = await seedBuyerWorkspace(db);
    const a = await seedUser(db, { name: '김민수' });
    const b = await seedUser(db, { name: '이영희' });
    await seedMembership(db, ws.id, a.id, 'admin', { joinedAt: new Date('2026-03-14T00:00:00Z') });
    await seedMembership(db, ws.id, b.id, 'member', { joinedAt: new Date('2026-04-01T00:00:00Z') });

    // 시스템 계정은 제외되어야 한다.
    const sysId = randomUUID();
    await db.insert(users).values({
      id: sysId, email: `sys-${sysId.slice(0, 8)}@example.com`,
      passwordHash: 'x', name: '시스템', avatarColor: 'ink', isSystemAccount: true,
    });
    await seedMembership(db, ws.id, sysId, 'member');

    const roster = await repo.teamRoster(ws.id);
    const byName = Object.fromEntries(roster.map((r) => [r.name, r]));
    expect(roster).toHaveLength(2);
    expect(byName['김민수'].userId).toBe(a.id);
    expect(byName['김민수'].joinedAt).toBe('2026-03-14T00:00:00.000Z');
    expect(byName['이영희']).toBeTruthy();
    expect(roster.some((r) => r.name === '시스템')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/workspace-roster.test.ts`
Expected: FAIL — `repo.teamRoster is not a function` (and `seedMembership` 4번째 인자 타입 오류).

- [ ] **Step 3a: Extend `seedMembership` for deterministic joinedAt**

`lib/server/repositories/drizzle/__tests__/_seed.ts` — `seedMembership` 교체:

```ts
export async function seedMembership(
  db: PgliteDB,
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' = 'member',
  overrides?: { joinedAt?: Date },
): Promise<void> {
  await db.insert(workspaceMembers).values({
    workspaceId,
    userId,
    role,
    ...(overrides?.joinedAt ? { joinedAt: overrides.joinedAt } : {}),
  });
}
```

- [ ] **Step 3b: Add `TeamMember` type + interface method**

`lib/server/repositories/types.ts` — `WorkspaceRepo` 인터페이스 안 `memberUserIds` 선언 아래에 추가:

```ts
  /** 멘션 자동완성/렌더용 팀 로스터 — {userId, name, joinedAt}. 시스템 계정 제외. */
  teamRoster(workspaceId: string, tx?: Tx): Promise<TeamMember[]>;
```

같은 파일에서 `WorkspaceRepo` 인터페이스 **바로 위**에 타입을 추가:

```ts
export type TeamMember = { userId: string; name: string; joinedAt: string };
```

- [ ] **Step 3c: Implement in drizzle workspace repo**

`lib/server/repositories/drizzle/workspace.ts` — import 에 `TeamMember` 추가:

```ts
import type { WorkspaceRepo, Tx, TeamMember } from '../types';
```

`memberUserIds` 메서드 바로 아래에 추가(클래스 내부, `asc` 는 이미 import 됨):

```ts
  async teamRoster(workspaceId: string, tx?: Tx): Promise<TeamMember[]> {
    const db = this.h(tx);
    const rows = (await db
      .select({
        userId: workspaceMembers.userId,
        name: usersTable.name,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(usersTable.isSystemAccount, false),
        ),
      )
      .orderBy(asc(workspaceMembers.joinedAt))) as {
      userId: string;
      name: string;
      joinedAt: Date;
    }[];
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      joinedAt: new Date(r.joinedAt).toISOString(),
    }));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/workspace-roster.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/workspace.ts lib/server/repositories/drizzle/__tests__/_seed.ts lib/server/repositories/drizzle/__tests__/workspace-roster.test.ts
git commit -m "feat: WorkspaceRepo.teamRoster (userId/name/joinedAt, system excluded)"
```

---

## Task 3: `NotificationRepo.hasPendingTeamMentionNotification`

**Files:**
- Modify: `lib/server/repositories/types.ts` (NotificationRepo interface)
- Modify: `lib/server/repositories/drizzle/notification.ts`
- Test: `lib/server/repositories/drizzle/__tests__/notification-mention-dedupe.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/server/repositories/drizzle/__tests__/notification-mention-dedupe.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleNotificationRepository } from '../notification';
import { seedUser } from './_seed';
import type { Notification } from '@/lib/types/notification';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('DrizzleNotificationRepository.hasPendingTeamMentionNotification', () => {
  it('같은 window 내 team_chat.mention 알림이 있으면 true, 없으면 false', async () => {
    const repo = new DrizzleNotificationRepository(db);
    const u = await seedUser(db);
    const rfpId = '33333333-3333-4333-8333-333333333333';
    const windowStart = new Date('2026-06-14T00:00:00Z');

    expect(await repo.hasPendingTeamMentionNotification(u.id, rfpId, windowStart)).toBe(false);

    const notif: Notification = {
      id: '44444444-4444-4444-8444-444444444444',
      userId: u.id,
      workspaceId: null,
      type: 'team_chat.mention',
      title: '언급',
      body: 'x',
      channel: 'inapp',
      status: 'pending', // 저장 시 'queued' 로 매핑
      linkUrl: `/messages?t=${rfpId}`,
      createdAt: '2026-06-14T00:01:00Z',
    };
    await repo.save(notif);

    expect(await repo.hasPendingTeamMentionNotification(u.id, rfpId, windowStart)).toBe(true);
    // team_chat.message 일반 알림 dedupe 와 섞이지 않는다.
    expect(await repo.hasPendingTeamNotification(u.id, rfpId, windowStart)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/notification-mention-dedupe.test.ts`
Expected: FAIL — `repo.hasPendingTeamMentionNotification is not a function`.

- [ ] **Step 3a: Add to interface**

`lib/server/repositories/types.ts` — `NotificationRepo` 안 `hasPendingTeamNotification` 아래:

```ts
  /** 동일 window 내 team_chat.mention 인앱 알림 존재 여부(멘션 전용 dedupe). */
  hasPendingTeamMentionNotification(userId: string, rfpId: string, windowStart: Date, tx?: Tx): Promise<boolean>;
```

- [ ] **Step 3b: Implement in drizzle**

`lib/server/repositories/drizzle/notification.ts` — `hasPendingTeamNotification` 메서드 바로 아래(클래스 닫힘 `}` 직전)에 추가:

```ts
  async hasPendingTeamMentionNotification(
    userId: string,
    rfpId: string,
    windowStart: Date,
    tx?: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, 'team_chat.mention'),
          eq(notifications.linkUrl, `/messages?t=${rfpId}`),
          eq(notifications.status, 'queued'),
          gte(notifications.createdAt, windowStart),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/notification-mention-dedupe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/notification.ts lib/server/repositories/drizzle/__tests__/notification-mention-dedupe.test.ts
git commit -m "feat: NotificationRepo.hasPendingTeamMentionNotification dedupe"
```

---

## Task 4: `TeamChatService.listTeamMembers`

**Files:**
- Modify: `lib/server/services/team-chat.ts`
- Test: `lib/server/services/__tests__/team-chat.test.ts` (새 describe 추가)

- [ ] **Step 1: Write the failing test**

`lib/server/services/__tests__/team-chat.test.ts` — 파일 끝(마지막 `});` 뒤)에 추가:

```ts
describe('TeamChatService.listTeamMembers', () => {
  it('owning buyer 액터에게 팀 로스터를 반환한다', async () => {
    const { rfp, buyerActor, buyerUser } = await seedScene();
    const result = await service.listTeamMembers(rfp.id, buyerActor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.members.map((m) => m.userId)).toContain(buyerUser.id);
      expect(result.members.find((m) => m.userId === buyerUser.id)?.name).toBe('김구매');
    }
  });

  it('권한 없는 buyer 는 FORBIDDEN', async () => {
    const { rfp } = await seedScene();
    const otherWs = await seedBuyerWorkspace(db);
    const otherUser = await seedUser(db);
    await seedMembership(db, otherWs.id, otherUser.id, 'admin');
    const result = await service.listTeamMembers(rfp.id, {
      userId: otherUser.id, workspaceId: otherWs.id, workspaceType: 'buyer',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts -t listTeamMembers`
Expected: FAIL — `service.listTeamMembers is not a function`.

- [ ] **Step 3: Implement**

`lib/server/services/team-chat.ts` — import 에 `TeamMember` 추가(기존 repo 타입 import 블록에):

```ts
  WorkspaceRepo,
  type TeamMember,
```

> 주의: `import type { ... }` 블록이면 `TeamMember` 도 그 안에 한 줄로 추가하면 된다. 실제 블록은 `import type { InvitationRepo, ... WorkspaceRepo } from '@/lib/server/repositories/types';` 이므로 `TeamMember` 를 목록에 추가한다.

그리고 `listMessages` 메서드 바로 아래에 추가:

```ts
  async listTeamMembers(
    rfpId: string,
    actor: TeamChatActor,
  ): Promise<ServiceResult<{ members: TeamMember[] }>> {
    const auth = await this.authorize(rfpId, actor);
    if (!auth.ok) return auth;
    const members = await this.wsRepo.teamRoster(actor.workspaceId);
    return { ok: true, members };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts -t listTeamMembers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/services/team-chat.ts lib/server/services/__tests__/team-chat.test.ts
git commit -m "feat: TeamChatService.listTeamMembers (ACL-gated roster)"
```

---

## Task 5: `TeamChatService.sendMessage` 멘션 팬아웃

**Files:**
- Modify: `lib/server/services/team-chat.ts`
- Test: `lib/server/services/__tests__/team-chat.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/server/services/__tests__/team-chat.test.ts` — 파일 끝에 추가. 헬퍼는 buyer 워크스페이스에 멤버 2명을 둔 씬을 만든다:

```ts
import { notifications as notifTable } from '@/lib/db/schema'; // 이미 `notifications` 로 import 되어 있으면 재사용

describe('TeamChatService.sendMessage — 멘션', () => {
  async function buyerSceneWithTwoMembers() {
    const author = await seedUser(db, { name: '김구매' });
    const mate = await seedUser(db, { name: '이동료' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, author.id, 'admin');
    await seedMembership(db, ws.id, mate.id, 'member');
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: author.id });
    const actor: TeamChatActor = { userId: author.id, workspaceId: ws.id, workspaceType: 'buyer' };
    return { author, mate, ws, rfp, actor };
  }

  async function notifsFor(userId: string) {
    return db.select().from(notifications).where(eq(notifications.userId, userId));
  }

  it('멘션된 멤버는 team_chat.mention, 작성자는 알림 없음', async () => {
    const { mate, rfp, actor, author } = await buyerSceneWithTwoMembers();
    const r = await service.sendMessage({ rfpId: rfp.id, body: `<@${mate.id}> 확인해줘` }, actor);
    expect(r.ok).toBe(true);

    const mateNotifs = await notifsFor(mate.id);
    expect(mateNotifs).toHaveLength(1);
    expect(mateNotifs[0].type).toBe('team_chat.mention');
    // 미리보기는 토큰이 아니라 평문 @이름.
    expect(mateNotifs[0].body).toContain('@이동료');

    const authorNotifs = await notifsFor(author.id);
    expect(authorNotifs).toHaveLength(0);
  });

  it('멘션 안 된 멤버는 기존 team_chat.message 알림', async () => {
    const { mate, rfp, actor } = await buyerSceneWithTwoMembers();
    await service.sendMessage({ rfpId: rfp.id, body: '그냥 메모' }, actor);
    const mateNotifs = await notifsFor(mate.id);
    expect(mateNotifs).toHaveLength(1);
    expect(mateNotifs[0].type).toBe('team_chat.message');
  });

  it('비멤버 uuid 토큰은 무시 — 알림/누출 없음', async () => {
    const { mate, rfp, actor } = await buyerSceneWithTwoMembers();
    const stranger = '99999999-9999-4999-8999-999999999999';
    await service.sendMessage({ rfpId: rfp.id, body: `<@${stranger}> 안녕` }, actor);
    // 멤버 mate 는 멘션되지 않았으므로 일반 알림.
    const mateNotifs = await notifsFor(mate.id);
    expect(mateNotifs).toHaveLength(1);
    expect(mateNotifs[0].type).toBe('team_chat.message');
    // stranger 에게는 어떤 알림도 생성되지 않는다.
    const strangerNotifs = await notifsFor(stranger);
    expect(strangerNotifs).toHaveLength(0);
  });

  it('@all 은 작성자 제외 전원에게 team_chat.mention', async () => {
    const { mate, rfp, actor, author } = await buyerSceneWithTwoMembers();
    const r = await service.sendMessage({ rfpId: rfp.id, body: '<@all> 공지' }, actor);
    expect(r.ok).toBe(true);
    const mateNotifs = await notifsFor(mate.id);
    expect(mateNotifs).toHaveLength(1);
    expect(mateNotifs[0].type).toBe('team_chat.mention');
    expect(await notifsFor(author.id)).toHaveLength(0);
  });
});
```

> 참고: `notifications`, `eq` 는 파일 상단에서 이미 import 되어 있다(line 33–34). `seedRfp` 도 import 되어 있다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts -t 멘션`
Expected: FAIL — 멘션 멤버도 현재는 `team_chat.message` 로 알림이 가므로 `type === 'team_chat.mention'` 단언이 깨진다.

- [ ] **Step 3: Implement the fan-out branch**

`lib/server/services/team-chat.ts` — 상단 import 에 멘션 유틸 추가(파일 맨 위 import 그룹):

```ts
import { extractMentions, mentionsToPlainText } from '@/lib/team-mentions';
```

`sendMessage` 의 팬아웃 블록(현재 line 179–222) 전체를 아래로 교체:

```ts
      // 팀 알림 팬아웃 — 같은 워크스페이스의 다른 멤버(작성자 제외)에게 인앱 알림.
      // 멘션된 멤버는 team_chat.mention(멘션 전용 dedupe), 그 외는 기존
      // team_chat.message(일반 dedupe). 이메일 digest 는 윈도당 멤버 1회 enqueue.
      const now = createdAt;
      const windowStart = new Date(chatDigestBucket(now) * CHAT_DIGEST_WINDOW_MS);
      const roster = await this.wsRepo.teamRoster(actor.workspaceId, tx);
      const nameById = new Map(roster.map((r) => [r.userId, r.name]));
      const memberIdSet = new Set(roster.map((r) => r.userId));
      const { userIds: mentionedRaw, all } = extractMentions(body);
      // 서버에서 멤버십 재검증 — 비멤버 토큰은 드롭(크로스팀 누출/알림 방지).
      const mentioned = new Set<string>(
        all ? [...memberIdSet] : mentionedRaw.filter((uid) => memberIdSet.has(uid)),
      );
      // 미리보기는 토큰이 아닌 평문(@이름/@전체).
      const preview =
        body.length > 0 ? mentionsToPlainText(body, nameById).slice(0, 120) : '첨부 파일';

      for (const memberId of memberIdSet) {
        if (memberId === actor.userId) continue;

        // 디스패치 전에 윈도 내 기존 팀 알림을 스냅샷(이메일 1회 enqueue 게이트용).
        const hadGeneric = await this.notifRepo.hasPendingTeamNotification(
          memberId, input.rfpId, windowStart, tx,
        );
        const hadMention = await this.notifRepo.hasPendingTeamMentionNotification(
          memberId, input.rfpId, windowStart, tx,
        );

        if (mentioned.has(memberId)) {
          if (!hadMention) {
            const notif: Notification = {
              id: randomUUID(),
              userId: memberId,
              workspaceId: actor.workspaceId,
              type: 'team_chat.mention',
              title: `${authorName}님이 회원님을 언급했어요`,
              body: preview,
              channel: 'inapp',
              status: 'pending',
              linkUrl: `/messages?t=${input.rfpId}`,
              createdAt: now.toISOString(),
            };
            await dispatchNotification(tx, notif);
            pendingEmits.push(notif);
          }
        } else {
          if (!hadGeneric) {
            const notif: Notification = {
              id: randomUUID(),
              userId: memberId,
              workspaceId: actor.workspaceId,
              type: 'team_chat.message',
              title: `${authorName}님의 팀 메시지`,
              body: preview,
              channel: 'inapp',
              status: 'pending',
              linkUrl: `/messages?t=${input.rfpId}`,
              createdAt: now.toISOString(),
            };
            await dispatchNotification(tx, notif);
            pendingEmits.push(notif);
          }
        }

        // 이메일 digest — (rfp, workspace, recipient) 윈도당 1회. 첫 팀 알림 발생
        // 시점에만 enqueue(outbox dedupeKey UNIQUE 로 coalesce). 본문은 placeholder;
        // flushTeamChatDigests 가 발송 시 재계산·읽음 단락.
        if (!hadGeneric && !hadMention) {
          const member = await this.userRepo.findById(memberId, tx);
          if (member?.email) {
            await this.outboxRepo.enqueue(
              {
                event: 'team_chat.message',
                to: member.email,
                subject: '[Supporter B] 새 팀 메시지',
                html: '<p>새 팀 메시지가 있어요.</p>', // placeholder — processor recomputes at send
                dedupeKey: teamDigestDedupeKey(input.rfpId, actor.workspaceId, memberId, now),
                scheduledAt: teamDigestWindowEnd(now),
              },
              tx,
            );
          }
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts`
Expected: PASS (멘션 describe + 기존 sendMessage 테스트 전부 green).

- [ ] **Step 5: Commit**

```bash
git add lib/server/services/team-chat.ts lib/server/services/__tests__/team-chat.test.ts
git commit -m "feat: mention fan-out in TeamChatService.sendMessage (mention vs generic, @all, membership-validated)"
```

---

## Task 6: `listThreads` 미리보기 토큰 평문화

**Files:**
- Modify: `lib/server/services/team-chat.ts`
- Test: `lib/server/services/__tests__/team-chat.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/server/services/__tests__/team-chat.test.ts` — 파일 끝에 추가:

```ts
describe('TeamChatService.listThreads — 미리보기 평문화', () => {
  it('마지막 메시지의 멘션 토큰을 @이름 평문으로 보여준다', async () => {
    const author = await seedUser(db, { name: '김구매' });
    const mate = await seedUser(db, { name: '이동료' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, author.id, 'admin');
    await seedMembership(db, ws.id, mate.id, 'member');
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: author.id });
    const actor: TeamChatActor = { userId: author.id, workspaceId: ws.id, workspaceType: 'buyer' };

    await service.sendMessage({ rfpId: rfp.id, body: `<@${mate.id}> 확인` }, actor);
    const r = await service.listThreads(actor);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = r.threads.find((x) => x.rfpId === rfp.id)!;
      expect(t.preview).toBe('@이동료 확인');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts -t 미리보기`
Expected: FAIL — preview 가 raw `<@uuid> 확인` 로 나온다.

- [ ] **Step 3: Implement**

`lib/server/services/team-chat.ts` — `listThreads` 메서드 교체(roster 로 nameById 구성 후 preview 평문화):

```ts
  async listThreads(actor: TeamChatActor): Promise<ServiceResult<{ threads: TeamThreadEntry[] }>> {
    const [summaries, roster] = await Promise.all([
      this.msgRepo.listThreadsForWorkspace(actor.workspaceId),
      this.wsRepo.teamRoster(actor.workspaceId),
    ]);
    const nameById = new Map(roster.map((r) => [r.userId, r.name]));
    const entries = await Promise.all(
      summaries.map(async (s) => {
        const [rfp, read] = await Promise.all([
          this.rfpRepo.findById(s.rfpId),
          this.readRepo.getFor(s.rfpId, actor.workspaceId, actor.userId),
        ]);
        const lastReadAt = read?.lastReadAt ?? null;
        const unread =
          s.lastAuthorUserId !== actor.userId &&
          (lastReadAt === null || s.lastMessageAt > lastReadAt);
        return {
          rfpId: s.rfpId,
          rfpCode: rfp?.code ?? '',
          rfpTitle: rfp?.title ?? '',
          preview: s.lastBody.length > 0 ? mentionsToPlainText(s.lastBody, nameById) : '첨부 파일',
          lastMessageAt: s.lastMessageAt.toISOString(),
          unread,
        } satisfies TeamThreadEntry;
      }),
    );
    return { ok: true, threads: entries };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/services/__tests__/team-chat.test.ts -t 미리보기`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/services/team-chat.ts lib/server/services/__tests__/team-chat.test.ts
git commit -m "feat: resolve mention tokens to plain text in team thread preview"
```

---

## Task 7: 이메일 digest 본문 토큰 평문화

**Files:**
- Modify: `lib/server/outbox/team-chat-digest-flush.ts`
- Test: `lib/server/outbox/__tests__/team-chat-digest-flush.test.ts` (기존 파일 있으면 case 추가, 없으면 생성)

- [ ] **Step 1: Write the failing test**

먼저 기존 테스트 존재 확인: `ls lib/server/outbox/__tests__/ | grep team-chat-digest`. 있으면 그 파일에 아래 it 을 추가, 없으면 새 파일 `lib/server/outbox/__tests__/team-chat-digest-flush.test.ts` 를 생성하되 같은 디렉터리의 다른 digest-flush 테스트(예: `chat-digest-flush.test.ts`)의 셋업(PGlite + factory + seed)을 그대로 미러링한다.

추가할 케이스(개념):

```ts
it('digest 이메일 본문/프리뷰에서 멘션 토큰을 @이름 평문으로 렌더한다', async () => {
  // author + mate 를 buyer ws 에 두고, author 가 `<@${mate.id}> 확인` 메시지를 보낸다.
  // outbox team_chat.message row 가 생긴다(scheduledAt=window end).
  // flushTeamChatDigests(captureSender) 를 호출.
  // captureSender 가 받은 html/preview 에 raw `<@` 가 없고 '@이동료' 가 포함되어야 한다.
  const sent: { subject: string; html: string }[] = [];
  const sender = async (e: { subject: string; html: string }) => {
    sent.push({ subject: e.subject, html: e.html });
    return { ok: true as const };
  };
  // ... seed + sendMessage + outbox 시간 도래 처리 후:
  const res = await flushTeamChatDigests(sender);
  expect(res.sent).toBe(1);
  expect(sent[0].html).not.toContain('<@');
  expect(sent[0].html).toContain('@이동료');
});
```

> 정확한 셋업은 동일 디렉터리의 기존 digest-flush 테스트를 복제한다(outbox `dueTeamChatDigests` 가 `scheduledAt <= now` 를 본다 — sendMessage 후 `outbox` 의 `scheduledAt` 을 과거로 당기거나, 테스트가 윈도 경계 이후 시각을 쓰도록 한다).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/outbox/__tests__/team-chat-digest-flush.test.ts -t 멘션`
Expected: FAIL — html 에 raw `<@uuid>` 가 포함된다.

- [ ] **Step 3: Implement**

`lib/server/outbox/team-chat-digest-flush.ts`:

import 추가:

```ts
import { mentionsToPlainText } from '@/lib/team-mentions';
```

`preview` 계산 직전, 루프 안에서 roster 로 nameById 를 만든다. `wsRepo` 는 이미 있으니 `teamRoster` 사용. `latest` 계산 이후 부분을 교체:

```ts
    // Recompute the digest body from the unread messages.
    const latest = unread[unread.length - 1];
    const roster = await wsRepo.teamRoster(workspaceId);
    const nameById = new Map(roster.map((r) => [r.userId, r.name]));
    const latestPlain = mentionsToPlainText(latest.body, nameById);
    const preview =
      latestPlain.length > 0 ? latestPlain.slice(0, PREVIEW_LEN) : EMPTY_PREVIEW;
```

(나머지 `senderName`/`html`/`subject`/발송 로직은 그대로.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/outbox/__tests__/team-chat-digest-flush.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/outbox/team-chat-digest-flush.ts lib/server/outbox/__tests__/team-chat-digest-flush.test.ts
git commit -m "feat: resolve mention tokens to plain text in team digest email"
```

---

## Task 8: 로더 `teamThreadLoader` 에 `teamMembers` 추가

**Files:**
- Modify: `lib/server/actions/chat/teamThreadLoader.ts`
- Test: `lib/server/actions/chat/__tests__/teamThreadLoader.test.ts` (있으면 case 추가; 없으면 서비스 레벨에서 검증한 listTeamMembers 로 충분 — 로더는 얇은 조립이므로 TDD 면제 가능. 단 타입 변경은 컴파일로 검증)

- [ ] **Step 1: Modify the loader (type + wiring)**

`lib/server/actions/chat/teamThreadLoader.ts`:

`LoadTeamThreadResult` 타입에 `teamMembers` 추가:

```ts
export type LoadTeamThreadResult = ChatActionResult<{
  rfpId: string;
  workspaceId: string;
  /** 세션 유저 id — 라이브 echo 의 self 판별용(클라이언트는 세션을 모른다). */
  viewerUserId: string;
  /** 멘션 자동완성/렌더용 팀 로스터. */
  teamMembers: { userId: string; name: string; joinedAt: string }[];
  messages: TeamThreadMessage[];
}>;
```

`loadTeamThread` 본문에서 messages 로드 뒤 roster 도 로드하고 결과에 넣는다. `service.listMessages` 호출 뒤에 추가:

```ts
  const membersResult = await service.listTeamMembers(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
    workspaceType: ws.workspaceType,
  });
  const teamMembers = membersResult.ok ? membersResult.members : [];
```

그리고 `return { ok: true, ... }` 에 `teamMembers,` 한 줄 추가(예: `viewerUserId` 다음):

```ts
    viewerUserId: ws.userId,
    teamMembers,
    messages: result.messages.map((m) => ({
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit 2>&1 | grep teamThreadLoader || echo "no loader type errors"`
Expected: no loader type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/server/actions/chat/teamThreadLoader.ts
git commit -m "feat: loadTeamThread returns teamMembers roster"
```

---

## Task 9: 컴포저 순수 로직 `components/messages/mention-input.ts`

**Files:**
- Create: `components/messages/mention-input.ts`
- Test: `components/messages/__tests__/mention-input.test.ts`

- [ ] **Step 1: Write the failing test**

`components/messages/__tests__/mention-input.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  detectMentionQuery,
  buildMentionItems,
  applyMentionSelection,
  resolveMentionsToBody,
  type MentionCandidate,
} from '../mention-input';
import { ALL_TOKEN, serializeMention } from '@/lib/team-mentions';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const cands: MentionCandidate[] = [
  { userId: U1, name: '김민수', joinedAt: '2026-03-14T00:00:00.000Z' },
  { userId: U2, name: '김민수', joinedAt: '2026-04-01T00:00:00.000Z' },
];

describe('detectMentionQuery', () => {
  it('커서 앞 @쿼리를 찾는다(문자열 시작)', () => {
    expect(detectMentionQuery('@김', 2)).toEqual({ query: '김', start: 0 });
  });
  it('공백 뒤 @ 도 인식', () => {
    expect(detectMentionQuery('안녕 @이', 4)).toEqual({ query: '이', start: 3 });
  });
  it('@ 앞이 문자면 멘션 아님(이메일 등)', () => {
    expect(detectMentionQuery('a@b', 3)).toBeNull();
  });
  it('@와 커서 사이 공백이 있으면 종료', () => {
    expect(detectMentionQuery('@김 민', 4)).toBeNull();
  });
  it('빈 쿼리(@ 직후)도 인식', () => {
    expect(detectMentionQuery('@', 1)).toEqual({ query: '', start: 0 });
  });
});

describe('buildMentionItems', () => {
  it('빈 쿼리는 @전체 + 전원', () => {
    const items = buildMentionItems(cands, '');
    expect(items[0]).toEqual({ kind: 'all' });
    expect(items).toHaveLength(3);
  });
  it('초성 검색(ㄱㅁㅅ → 김민수)', () => {
    const items = buildMentionItems(cands, 'ㄱㅁㅅ');
    expect(items.every((i) => i.kind === 'member')).toBe(true);
    expect(items).toHaveLength(2);
  });
  it('"전체" 쿼리는 @전체 매칭', () => {
    const items = buildMentionItems(cands, '전체');
    expect(items).toEqual([{ kind: 'all' }]);
  });
});

describe('applyMentionSelection', () => {
  it('개인 선택 시 @이름 삽입 + 토큰 추적', () => {
    const out = applyMentionSelection('@김', { query: '김', start: 0 }, {
      kind: 'member', userId: U1, name: '김민수',
    });
    expect(out.text).toBe('@김민수 ');
    expect(out.caret).toBe('@김민수 '.length);
    expect(out.tracked).toEqual({ display: '@김민수', token: serializeMention(U1) });
  });
  it('전체 선택 시 @전체 삽입 + all 토큰', () => {
    const out = applyMentionSelection('@', { query: '', start: 0 }, { kind: 'all' });
    expect(out.text).toBe('@전체 ');
    expect(out.tracked).toEqual({ display: '@전체', token: ALL_TOKEN });
  });
});

describe('resolveMentionsToBody', () => {
  it('추적된 표시를 토큰으로 치환', () => {
    const body = resolveMentionsToBody('@김민수 확인', [
      { display: '@김민수', token: serializeMention(U1) },
    ]);
    expect(body).toBe(`${serializeMention(U1)} 확인`);
  });
  it('동명이인 — 삽입 순서대로 각각 토큰화', () => {
    const body = resolveMentionsToBody('@김민수 @김민수 보세요', [
      { display: '@김민수', token: serializeMention(U1) },
      { display: '@김민수', token: serializeMention(U2) },
    ]);
    expect(body).toBe(`${serializeMention(U1)} ${serializeMention(U2)} 보세요`);
  });
  it('편집으로 사라진 멘션은 드롭(토큰 없음)', () => {
    const body = resolveMentionsToBody('그냥 텍스트', [
      { display: '@김민수', token: serializeMention(U1) },
    ]);
    expect(body).toBe('그냥 텍스트');
  });
  it('접두가 겹쳐도 부분 매칭하지 않는다(@김 vs @김민수)', () => {
    const body = resolveMentionsToBody('@김민수 안녕', [
      { display: '@김', token: serializeMention(U1) },
    ]);
    // '@김' 은 '@김민수' 안에서 매칭되지 않아야 한다 → 드롭.
    expect(body).toBe('@김민수 안녕');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/messages/__tests__/mention-input.test.ts`
Expected: FAIL — `Cannot find module '../mention-input'`.

- [ ] **Step 3: Write minimal implementation**

`components/messages/mention-input.ts`:

```ts
// 팀 채팅 멘션 컴포저 순수 로직 — textarea 평문 표시 ↔ 전송 시 구조화 토큰 변환.
// 무의존 순수 함수(렌더/상태 없음)로 TDD. TeamThreadView 가 이를 조립한다.
import { getChoseong } from 'es-hangul';
import { ALL_TOKEN, serializeMention } from '@/lib/team-mentions';

export type MentionCandidate = { userId: string; name: string; joinedAt: string };

export type MentionItem =
  | { kind: 'all' }
  | { kind: 'member'; userId: string; name: string; joinedAt: string };

export type MentionPick =
  | { kind: 'all' }
  | { kind: 'member'; userId: string; name: string };

export type MentionQuery = { query: string; start: number };
export type TrackedMention = { display: string; token: string };

/** 커서 직전의 활성 `@쿼리` 를 찾는다. 멘션 컨텍스트가 아니면 null. */
export function detectMentionQuery(text: string, caret: number): MentionQuery | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      const before = i > 0 ? text[i - 1] : '';
      if (before === '' || /\s/.test(before)) {
        return { query: text.slice(i + 1, caret), start: i };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

function matches(name: string, q: string): boolean {
  if (q === '') return true;
  return name.includes(q) || getChoseong(name).includes(q);
}

/** 후보 필터링 — 이름 substring/초성. '@전체' 는 매칭 시 상단 고정. */
export function buildMentionItems(candidates: MentionCandidate[], query: string): MentionItem[] {
  const q = query.trim();
  const items: MentionItem[] = [];
  const allMatches =
    q === '' || matches('전체', q) || 'all'.startsWith(q.toLowerCase());
  if (allMatches) items.push({ kind: 'all' });
  for (const c of candidates) {
    if (matches(c.name, q)) {
      items.push({ kind: 'member', userId: c.userId, name: c.name, joinedAt: c.joinedAt });
    }
  }
  return items;
}

/** `@쿼리` 구간을 표시 텍스트로 치환하고 추적 멘션을 반환. */
export function applyMentionSelection(
  text: string,
  query: MentionQuery,
  pick: MentionPick,
): { text: string; caret: number; tracked: TrackedMention } {
  const display = pick.kind === 'all' ? '@전체' : `@${pick.name}`;
  const token = pick.kind === 'all' ? ALL_TOKEN : serializeMention(pick.userId);
  const before = text.slice(0, query.start);
  const after = text.slice(query.start + 1 + query.query.length); // '@' + query 제거
  const insert = `${display} `;
  return { text: before + insert + after, caret: before.length + insert.length, tracked: { display, token } };
}

function indexOfDisplay(body: string, display: string): number {
  let from = 0;
  for (;;) {
    const idx = body.indexOf(display, from);
    if (idx < 0) return -1;
    const after = body[idx + display.length];
    // 경계: 끝이거나 글자/숫자가 아니어야 한다(@김 이 @김민수 안에서 매칭되지 않게).
    if (after === undefined || !/[\p{L}\p{N}]/u.test(after)) return idx;
    from = idx + 1;
  }
}

/** 전송 시 — 추적된 표시를 첫 미소비 occurrence 부터 토큰으로 치환. 사라진 건 드롭. */
export function resolveMentionsToBody(text: string, tracked: TrackedMention[]): string {
  let body = text;
  for (const t of tracked) {
    const idx = indexOfDisplay(body, t.display);
    if (idx < 0) continue;
    body = body.slice(0, idx) + t.token + body.slice(idx + t.display.length);
  }
  return body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/messages/__tests__/mention-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/messages/mention-input.ts components/messages/__tests__/mention-input.test.ts
git commit -m "feat: mention-input pure composer logic (detect/filter/apply/resolve)"
```

---

## Task 10: `MentionText` 렌더 컴포넌트

**Files:**
- Create: `components/messages/MentionText.tsx`
- Test: `components/messages/__tests__/MentionText.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/messages/__tests__/MentionText.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MentionText } from '../MentionText';
import { serializeMention, ALL_TOKEN } from '@/lib/team-mentions';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const names = new Map([[U1, '김민수'], [U2, '이영희']]);

describe('MentionText', () => {
  it('멘션 토큰을 @이름 으로 강조 렌더', () => {
    render(<MentionText body={`${serializeMention(U1)} 확인`} nameById={names} viewerUserId={U2} />);
    expect(screen.getByText('@김민수')).toBeInTheDocument();
    expect(screen.getByText(/확인/)).toBeInTheDocument();
  });

  it('본인 멘션은 data-self-mention 으로 표시', () => {
    render(<MentionText body={serializeMention(U2)} nameById={names} viewerUserId={U2} />);
    const el = screen.getByText('@이영희');
    expect(el).toHaveAttribute('data-self-mention', 'true');
  });

  it('타인 멘션은 data-self-mention=false', () => {
    render(<MentionText body={serializeMention(U1)} nameById={names} viewerUserId={U2} />);
    expect(screen.getByText('@김민수')).toHaveAttribute('data-self-mention', 'false');
  });

  it('@all 은 @전체 로 렌더', () => {
    render(<MentionText body={ALL_TOKEN} nameById={names} viewerUserId={U2} />);
    expect(screen.getByText('@전체')).toBeInTheDocument();
  });

  it('알 수 없는 멤버는 fallback', () => {
    render(<MentionText body={serializeMention(U1)} nameById={new Map()} viewerUserId={U2} />);
    expect(screen.getByText('@(알 수 없음)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/messages/__tests__/MentionText.test.tsx`
Expected: FAIL — `Cannot find module '../MentionText'`.

- [ ] **Step 3: Write minimal implementation**

`components/messages/MentionText.tsx`:

```tsx
// 팀 채팅 본문 렌더 — 멘션 토큰을 현재 이름의 강조 span 으로 치환.
// 본인 멘션(viewerUserId 일치)은 더 강한 강조. 텍스트 세그먼트는 부모의
// whitespace-pre-wrap 을 그대로 보존하도록 평문 문자열로 렌더한다.
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { parseMentions } from '@/lib/team-mentions';

type Props = {
  body: string;
  nameById: Map<string, string>;
  viewerUserId: string;
};

export function MentionText({ body, nameById, viewerUserId }: Props) {
  const segments = parseMentions(body);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Fragment key={i}>{seg.text}</Fragment>;
        const isSelf = seg.type === 'mention' && seg.userId === viewerUserId;
        const label =
          seg.type === 'all'
            ? '@전체'
            : `@${nameById.get(seg.userId) ?? '(알 수 없음)'}`;
        return (
          <span
            key={i}
            data-self-mention={isSelf ? 'true' : 'false'}
            className={cn(
              'rounded-[var(--md-sys-shape-extra-small)] px-0.5 font-medium',
              isSelf
                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                : 'text-[var(--md-sys-color-primary)]',
            )}
          >
            {label}
          </span>
        );
      })}
    </>
  );
}
```

> 참고: `--md-sys-shape-extra-small` 토큰이 없으면 `--md-sys-shape-small` 로 대체(둘 다 정의돼 있으면 extra-small 사용). 확인: `grep -n "shape-extra-small\|shape-small" styles/tokens.css`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/messages/__tests__/MentionText.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/messages/MentionText.tsx components/messages/__tests__/MentionText.test.tsx
git commit -m "feat: MentionText renders highlighted mentions (self stronger)"
```

---

## Task 11: `MentionDropdown` 컴포넌트

**Files:**
- Create: `components/messages/MentionDropdown.tsx`
- Test: `components/messages/__tests__/MentionDropdown.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/messages/__tests__/MentionDropdown.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MentionDropdown } from '../MentionDropdown';
import type { MentionItem } from '../mention-input';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

const items: MentionItem[] = [
  { kind: 'all' },
  { kind: 'member', userId: U1, name: '김민수', joinedAt: '2026-03-14T00:00:00.000Z' },
  { kind: 'member', userId: U2, name: '김민수', joinedAt: '2026-04-01T00:00:00.000Z' },
  { kind: 'member', userId: U3, name: '이영희', joinedAt: '2026-05-01T00:00:00.000Z' },
];

describe('MentionDropdown', () => {
  it('동명이인(김민수)에만 합류일자를 표시한다', () => {
    render(
      <MentionDropdown
        items={items}
        activeIndex={0}
        duplicateNames={new Set(['김민수'])}
        onPick={vi.fn()}
        onHover={vi.fn()}
      />,
    );
    // 김민수 2명 → 각각 합류일자(2026. 03. 14. / 2026. 04. 01.) 표시.
    expect(screen.getByText('2026. 03. 14.')).toBeInTheDocument();
    expect(screen.getByText('2026. 04. 01.')).toBeInTheDocument();
    // 이영희는 유일 → 합류일자 없음.
    expect(screen.queryByText('2026. 05. 01.')).not.toBeInTheDocument();
  });

  it('@전체 행과 아바타(이니셜)를 렌더', () => {
    render(
      <MentionDropdown items={items} activeIndex={1} duplicateNames={new Set()} onPick={vi.fn()} onHover={vi.fn()} />,
    );
    expect(screen.getByText('전체')).toBeInTheDocument();
    // 멤버 행은 이름 표시.
    expect(screen.getAllByText('김민수')).toHaveLength(2);
  });

  it('클릭 시 onPick(item) 호출', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <MentionDropdown items={items} activeIndex={0} duplicateNames={new Set()} onPick={onPick} onHover={vi.fn()} />,
    );
    await user.click(screen.getByText('이영희'));
    expect(onPick).toHaveBeenCalledWith(items[3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/messages/__tests__/MentionDropdown.test.tsx`
Expected: FAIL — `Cannot find module '../MentionDropdown'`.

- [ ] **Step 3: Write minimal implementation**

`components/messages/MentionDropdown.tsx`:

```tsx
// 멘션 자동완성 드롭다운(프레젠테이션). 각 행 = 아바타 + 이름 [+ 동명이인 합류일자].
// '@전체' 행은 그룹 아이콘. 키보드 상태(activeIndex)는 부모가 소유.
import { Avatar } from '@/components/primitives/Avatar';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { MentionItem } from './mention-input';

type Props = {
  items: MentionItem[];
  activeIndex: number;
  duplicateNames: Set<string>;
  onPick: (item: MentionItem) => void;
  onHover: (index: number) => void;
};

export function MentionDropdown({ items, activeIndex, duplicateNames, onPick, onHover }: Props) {
  if (items.length === 0) return null;
  return (
    <ul
      role="listbox"
      aria-label="멘션 대상"
      className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] py-1 shadow-lg"
    >
      {items.map((item, i) => {
        const active = i === activeIndex;
        const key = item.kind === 'all' ? 'all' : item.userId;
        return (
          <li
            key={key}
            role="option"
            aria-selected={active}
            // onMouseDown(preventDefault): textarea 포커스를 잃지 않고 선택.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px]',
              active && 'bg-[var(--md-sys-color-surface-container-highest)]',
            )}
          >
            {item.kind === 'all' ? (
              <>
                <span className="flex size-6 items-center justify-center rounded-[var(--md-sys-shape-full)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                  <Users size={14} strokeWidth={1.5} />
                </span>
                <span className="font-medium text-[var(--md-sys-color-on-surface)]">전체</span>
              </>
            ) : (
              <>
                <Avatar name={item.name} size="sm" color="surface" />
                <span className="text-[var(--md-sys-color-on-surface)]">{item.name}</span>
                {duplicateNames.has(item.name) && (
                  <span className="md-numeric ml-auto text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {formatDate(item.joinedAt)}
                  </span>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/messages/__tests__/MentionDropdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/messages/MentionDropdown.tsx components/messages/__tests__/MentionDropdown.test.tsx
git commit -m "feat: MentionDropdown with avatar + join-date disambiguation"
```

---

## Task 12: `TeamThreadView` 통합

**Files:**
- Modify: `components/messages/TeamThreadView.tsx`
- Modify: `components/messages/TeamThreadPane.tsx`
- Test: `components/messages/__tests__/TeamThreadView.test.tsx`

- [ ] **Step 1: Write the failing tests**

`components/messages/__tests__/TeamThreadView.test.tsx` — `base()` 의 `teamMembers` 기본값을 추가하고(기존 테스트 호환), 멘션 시나리오 describe 를 추가.

먼저 `base()` 를 교체:

```ts
const teamMembers = [
  { userId: 'u-mate', name: '이동료', joinedAt: '2026-03-14T00:00:00.000Z' },
  { userId: 'u-me', name: '김구매', joinedAt: '2026-04-01T00:00:00.000Z' },
];

function base(overrides: Partial<React.ComponentProps<typeof TeamThreadView>> = {}) {
  return (
    <TeamThreadView
      rfpId="rfp-1"
      workspaceId="ws-1"
      viewerUserId="u-me"
      messages={messages}
      teamMembers={teamMembers}
      {...overrides}
    />
  );
}
```

그리고 멘션 describe 추가:

```ts
describe('TeamThreadView — 멘션', () => {
  it('@ 입력 시 멤버 드롭다운이 뜨고, 선택하면 @이름 이 삽입된다', async () => {
    const user = userEvent.setup();
    render(base());
    const ta = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(ta, '@이');
    // 드롭다운 옵션에 '이동료'.
    const option = await screen.findByRole('option', { name: /이동료/ });
    await user.click(option);
    expect((ta as HTMLTextAreaElement).value).toContain('@이동료');
  });

  it('멘션 선택 후 전송하면 body 에 토큰이 들어간다', async () => {
    const user = userEvent.setup();
    render(base());
    const ta = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(ta, '@이');
    await user.click(await screen.findByRole('option', { name: /이동료/ }));
    await user.type(ta, '확인');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => {
      expect(sendTeamMessageAction).toHaveBeenCalledWith({
        rfpId: 'rfp-1',
        body: '<@u-mate> 확인',
        attachmentIds: [],
      });
    });
  });

  it('수신된 멘션 메시지를 @이름 으로 강조 렌더한다', () => {
    render(
      base({
        messages: [
          {
            id: 'tmM', authorUserId: 'u-mate', authorName: '이동료',
            body: '<@u-me> 봐주세요', createdAt: '2026-06-10T05:00:00.000Z',
            isSelf: false, attachments: [],
          },
        ],
      }),
    );
    // 본인(u-me) 멘션 → 강조 span.
    const el = screen.getByText('@김구매');
    expect(el).toHaveAttribute('data-self-mention', 'true');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test components/messages/__tests__/TeamThreadView.test.tsx -t 멘션`
Expected: FAIL — `teamMembers` prop 미지원/드롭다운 없음/`{m.body}` 가 raw 토큰 렌더.

- [ ] **Step 3: Implement the integration**

`components/messages/TeamThreadView.tsx` 변경:

3a. import 추가:

```ts
import { MentionText } from './MentionText';
import { MentionDropdown } from './MentionDropdown';
import {
  detectMentionQuery,
  buildMentionItems,
  applyMentionSelection,
  resolveMentionsToBody,
  type MentionCandidate,
  type MentionItem,
  type MentionQuery,
  type TrackedMention,
} from './mention-input';
```

3b. Props 타입에 `teamMembers` 추가(기본값 `[]`):

```ts
type Props = {
  rfpId: string;
  workspaceId: string;
  viewerUserId: string;
  messages: TeamThreadMessage[];
  teamMembers?: MentionCandidate[];
};
```

함수 시그니처:

```ts
export function TeamThreadView({ rfpId, workspaceId, viewerUserId, messages, teamMembers = [] }: Props) {
```

3c. 상태/파생값 추가(기존 useState 들 아래):

```ts
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const trackedRef = useRef<TrackedMention[]>([]);
  const caretRef = useRef<number | null>(null);

  // 렌더용 이름 맵 + 동명이인 집합(전체 로스터 기준).
  const nameById = useMemo(
    () => new Map(teamMembers.map((m) => [m.userId, m.name])),
    [teamMembers],
  );
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const m of teamMembers) seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
  }, [teamMembers]);
  // 본인 제외 후보(드롭다운).
  const candidates = useMemo(
    () => teamMembers.filter((m) => m.userId !== viewerUserId),
    [teamMembers, viewerUserId],
  );
```

> `useMemo` 를 import 에 추가: `import { useEffect, useMemo, useRef, useState } from 'react';`

3d. 선택 적용 후 caret 복원 effect 추가:

```ts
  useEffect(() => {
    if (caretRef.current !== null && textareaRef.current) {
      const pos = caretRef.current;
      textareaRef.current.setSelectionRange(pos, pos);
      caretRef.current = null;
    }
  }, [draft]);
```

3e. textarea `onChange` 를 멘션 인식 포함으로 교체:

```ts
            onChange={(e) => {
              const value = e.target.value;
              setDraft(value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              const q = detectMentionQuery(value, e.target.selectionStart ?? value.length);
              if (q) {
                const items = buildMentionItems(candidates, q.query);
                setMentionQuery(items.length > 0 ? q : null);
                setMentionItems(items);
                setMentionIndex(0);
              } else {
                setMentionQuery(null);
                setMentionItems([]);
              }
            }}
```

3f. 멘션 선택 핸들러 + 키보드 처리. `handleKeyDown` 을 교체하고 `pickMention` 추가:

```ts
  function pickMention(item: MentionItem): void {
    if (!mentionQuery) return;
    const pick =
      item.kind === 'all'
        ? ({ kind: 'all' } as const)
        : ({ kind: 'member', userId: item.userId, name: item.name } as const);
    const out = applyMentionSelection(draft, mentionQuery, pick);
    trackedRef.current = [...trackedRef.current, out.tracked];
    caretRef.current = out.caret;
    setDraft(out.text);
    setMentionQuery(null);
    setMentionItems([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (mentionQuery && mentionItems.length > 0) {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setMentionItems([]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      void handleSend();
    }
  }
```

3g. 전송 시 토큰화. `handleSend` 안의 `const body = draft.trim();` 를 교체:

```ts
    const body = resolveMentionsToBody(draft, trackedRef.current).trim();
```

그리고 성공/초기화 지점에서 추적 리셋 — `setDraft('')` 직후 줄에 추가:

```ts
    setDraft('');
    trackedRef.current = [];
    setMentionQuery(null);
    setMentionItems([]);
```

전송 실패 복구(`setDraft(restoreDraft);` 부근)에서는 추적을 복구할 필요 없음 — 사용자가 다시 멘션하면 재추적된다(드롭은 fail-safe). 단 restore 후 토큰이 평문으로 남아도 누출 없음(전송 안 됨).

3h. 컴포저 컨테이너에 드롭다운 추가. 컴포저 바깥 `div`(현재 `<div className="shrink-0 border-t ...">`)를 `relative` 로 만들고, textarea 를 감싸는 영역에 드롭다운을 둔다. textarea 가 들어있는 `<div className="flex items-end gap-2">` 를 `relative` 로 바꾸고 그 안 맨 위에 드롭다운을 추가:

```tsx
        <div className="relative flex items-end gap-2">
          {mentionQuery && mentionItems.length > 0 && (
            <MentionDropdown
              items={mentionItems}
              activeIndex={mentionIndex}
              duplicateNames={duplicateNames}
              onPick={pickMention}
              onHover={setMentionIndex}
            />
          )}
          {/* 기존 IconButton / input / textarea / Button ... 그대로 */}
```

3i. 메시지 본문 렌더를 `MentionText` 로 교체. 말풍선 안 `{m.body}` 를 교체:

```tsx
                    <MentionText body={m.body} nameById={nameById} viewerUserId={viewerUserId} />
```

3j. `TeamThreadPane.tsx` — `TeamThreadView` 에 `teamMembers` 전달. 렌더 부분(line 78–82) 교체:

```tsx
        <TeamThreadView
          rfpId={result.rfpId}
          workspaceId={result.workspaceId}
          viewerUserId={result.viewerUserId}
          teamMembers={result.teamMembers}
          messages={result.messages}
        />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test components/messages/__tests__/TeamThreadView.test.tsx`
Expected: PASS (멘션 describe + 기존 렌더/전송 테스트 전부 green).

> 주의: 멘션 드롭다운 테스트는 jsdom 에서 `userEvent.type` 의 `selectionStart` 가 갱신되는지에 의존한다. jsdom textarea 는 selectionStart 를 지원한다. 드롭다운 옵션이 안 뜨면 `detectMentionQuery` 에 넘기는 caret 이 올바른지(= `e.target.selectionStart`) 확인.

- [ ] **Step 5: Commit**

```bash
git add components/messages/TeamThreadView.tsx components/messages/TeamThreadPane.tsx components/messages/__tests__/TeamThreadView.test.tsx
git commit -m "feat: wire @-mention dropdown + token render into TeamThreadView"
```

---

## Task 13: 전체 헬스 + 마무리

**Files:** 없음(검증만)

- [ ] **Step 1: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: 0 errors. (워크트리 LSP 거짓진단은 무시 — `pnpm tsc` 가 진실. 사전 존재하던 wizard 테스트 글로벌 에러는 본 작업과 무관하니 필터: `pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"`.)

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Full unit suite**

Run: `pnpm test`
Expected: all green. (느려지면 [[full-suite-slow-swap-thrash]] — 단독 파일 재실행이 게이트.)

- [ ] **Step 4: Manual sanity (선택)**

`pnpm dev` 로 팀 채팅 진입 → `@` 입력 시 드롭다운(아바타+이름, 동명이인 합류일자) → 선택·전송 → 멘션 강조 + 멘션 대상 인앱 알림 확인.

- [ ] **Step 5: 문서/메모리 마무리는 /ship 단계에서 처리(SCREEN_DESIGN.md 팀 채팅 항목에 멘션 한 줄 추가 여부 검토).**

---

## Self-Review (작성자 체크 완료)

**Spec coverage:**
- 토큰 SSOT(spec §4) → Task 1. 컴포저(spec §6) → Task 9·12. 렌더(spec §7) → Task 10·12. 로더 roster(spec §8) → Task 2·4·8. 팬아웃(spec §9) → Task 5. DDL 없음(spec §10) → 확인됨(notifications.type=text). 미리보기/이메일/알림 평문화(spec §7) → Task 5(알림)·6(미리보기)·7(이메일). 동명이인 합류일자 + 아바타(spec §6) → Task 11. @all(spec §2) → Task 5.
- 갭 없음.

**Placeholder scan:** 없음. (Task 7 의 정확한 셋업만 "동일 디렉터리 기존 테스트 미러링" 으로 위임 — 그 디렉터리에 chat-digest-flush 선례가 있으므로 구체적 패턴 존재.)

**Type consistency:** `TeamMember`(types.ts) ↔ `teamRoster` 반환 ↔ 로더 `teamMembers` ↔ `MentionCandidate`(mention-input) 모두 `{userId,name,joinedAt:string}` 로 일치. `MentionItem`/`MentionPick`/`TrackedMention` 시그니처가 Task 9·11·12 에서 동일. `hasPendingTeamMentionNotification` 시그니처가 Task 3·5 에서 일치. `mentionsToPlainText`/`extractMentions` 시그니처가 Task 1·5·6·7 에서 일치.
