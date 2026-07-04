# 통합 `notify()` 알림 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 흩어진 `dispatchNotification(tx, n)` + `outboxRepo.enqueue(...)` 2-콜 패턴을, 채널을 명시적으로 선택하는 단일 `notify(tx, { recipients, channels, ... })` 팬아웃 API로 통합한다.

**Architecture:** 신규 `lib/server/notifications/notify.ts`가 기존 `dispatch.ts`(`dispatchNotification`/`emitAfterCommit`)·`bus.ts`(`emit`) 위의 팬아웃 계층이 된다. 수신자마다 채널에 따라 in-app row insert(내부적으로 `dispatchNotification`)와 email `outboxRepo.enqueue`를 tx 안에서 수행하고, 생성한 in-app `Notification[]`을 반환한다. 호출부는 반환값을 `pendingEmits`에 모아 commit 후 기존 `emitAfterCommit()`으로 SSE 발화한다(변경 없음).

**Tech Stack:** TypeScript strict, Drizzle ORM + Postgres, PGlite(단위 테스트 실 DB), Vitest, Next.js 서버 서비스 계층(`lib/server/services/*`).

## Global Constraints

- **DDL 0** — 스키마 변경 없음. `notifications`·`outbox_entries` 테이블 그대로.
- **신규 repo 메서드 0** — 통합 recipient(`{userId, email}`) 조회는 **이미 존재하는** `memberRecipients(wsId)` / `adminRecipients(wsId)` / `memberRecipientsBatch(wsIds)`를 사용한다. (스펙 문서의 "members/membersBatch 신규 추가"는 이 메서드들로 이미 충족됨 — 신규 추가 불필요.)
- **behavior-preserving 리팩터** — 각 마이그레이션 사이트는 전후로 **동일한 `notifications` row + `outbox_entries` 엔트리**를 만들어야 한다. 기존 action/service 테스트 그린 유지가 1차 게이트.
- **TDD** — `notify.ts`는 신규 코드이므로 실패 테스트 먼저(RED→GREEN). 마이그레이션은 리팩터이므로 기존 테스트를 baseline GREEN으로 먼저 확인한 뒤 전환하고, 다시 GREEN을 확인한다(characterization). 스펙이 요구하는 신규 단언(award 필터 등)은 먼저 작성한다.
- **repo-boundary 준수** — `notify.ts`는 `dispatch.ts`와 동일하게 factory(`getOutboxRepo()`)로 repo를 얻는다. `@/lib/db/schema`·`@/lib/db/client` 직접 값 import 금지.
- **채널은 호출 단위** — `channels`는 그 호출의 모든 recipient에 적용된다. 수신자별 채널 차이(chat/team_chat) 또는 채널별 수신자 집합 차이(acceptPgRequest·sendDraftInvitations의 admin-email vs all-member-inapp)는 `notify()`를 **여러 번** 호출해 표현한다.
- **스코프 경계** — `notify()`는 멤버십 기반 알림(userId+email 아는 워크스페이스 멤버)만. `auth.*`·`workspace.invited/approved/rejected` 등 비-유저 주소 메일은 계속 `outboxRepo.enqueue` 직접 호출(이 계획에서 건드리지 않음).
- **커밋 메시지 말미**: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

### ⚠️ 유일한 동작 델타 — award 이메일 수신자 필터 (검토 요망)

현재 `award`만 in-app과 email에 **다른 필터**를 쓴다:
- in-app: `memberUserIdsBatch` → `notifiableAccount`(`passwordHash != '!'`)
- email: `memberEmails` → `isSystemAccount = false`

통합하면 award 이메일도 `memberRecipientsBatch`(= `notifiableAccount`)를 쓰게 되어, 코드베이스의 나머지 사이트(bid/chat/requote/acceptPgRequest)와 필터가 **일치**한다. 두 필터가 갈라지는 계정은 (a) 데모 계정(`passwordHash='!'`, `isSystemAccount=false`) — 통합 후 award 이메일 대상에서 제외됨, (b) 비밀번호 있는 시스템 계정(희귀). **실제 낙찰은 실계정 PG 워크스페이스 대상이라 두 필터가 일치 → 실무 델타 0.** 기존 award 테스트(`dispatchIntegration.test.ts`, 실계정 seed)가 그린 게이트. Task 2에서 이 델타를 문서화하는 단언을 추가한다.

---

## File Structure

- **Create** `lib/server/notifications/notify.ts` — 통합 팬아웃 API (`notify`, 타입들).
- **Create** `lib/server/notifications/__tests__/notify.test.ts` — notify() 단위 테스트(PGlite).
- **Modify** `lib/server/services/rfp.ts` — 8개 사이트(award/cancel/close/rejectPgRequest/createPgRequest/acceptPgRequest/sendDraftInvitations/requote) 전환, `dispatchNotification` 직접 호출 제거.
- **Modify** `lib/server/services/bid.ts` — submitBid 전환.
- **Modify** `lib/server/services/chat.ts` — sendMessage 전환(수신자별 조건부).
- **Modify** `lib/server/services/team-chat.ts` — sendMessage 전환(mention/generic + digest).
- **Modify** `docs/superpowers/specs/2026-07-01-unified-notify-api-design.md` — repo 섹션을 "기존 메서드 재사용"으로 정정(Task 8).
- **불변**: `dispatch.ts`, `bus.ts`, `emitAfterCommit`, outbox flush, 스키마, repo 메서드.

---

## Task 1: `notify.ts` 코어 + 단위 테스트

**Files:**
- Create: `lib/server/notifications/notify.ts`
- Test: `lib/server/notifications/__tests__/notify.test.ts`

**Interfaces:**
- Consumes: `dispatchNotification(tx, n)` (`lib/server/notifications/dispatch.ts`), `getOutboxRepo()` (`lib/server/repositories/factory.ts`), `OutboxEvent` (`lib/server/outbox/types.ts`), `Notification` (`lib/types/notification.ts`), `Tx` (`lib/server/repositories/types.ts`).
- Produces (later tasks depend on these EXACT names/types):
  ```ts
  export type NotifyChannel = 'inapp' | 'email';
  export type NotifyRecipient = { userId: string; workspaceId: string | null; email: string };
  export type NotifyEmail = {
    event: OutboxEvent;
    subject: string;
    html: string;
    dedupeKey?: (email: string) => string;
    scheduledAt?: Date;
  };
  export type NotifyInput = {
    recipients: NotifyRecipient[];
    channels: NotifyChannel[];
    type: string;
    title: string;
    body: string;
    linkUrl?: string;
    email?: NotifyEmail;
  };
  export function notify(tx: Tx, input: NotifyInput): Promise<Notification[]>;
  ```

- [ ] **Step 1: 실패 테스트 작성**

`lib/server/notifications/__tests__/notify.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { notifications, outboxEntries } from '@/lib/db/schema';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { notify } from '../notify';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  __resetForTest();
});

describe('notify()', () => {
  it('channels:[inapp] → notifications row만, outbox 없음, 생성 알림 반환', async () => {
    const u = await seedUser(db, { email: 'a@x.com' });
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
        channels: ['inapp'],
        type: 'rfp.awarded',
        title: 't',
        body: 'b',
        linkUrl: '/inbox/X',
      }),
    );
    const notifRows = await db.select().from(notifications);
    const outboxRows = await db.select().from(outboxEntries);
    expect(notifRows).toHaveLength(1);
    expect(notifRows[0].channel).toBe('in_app');
    expect(notifRows[0].userId).toBe(u.id);
    expect(notifRows[0].linkUrl).toBe('/inbox/X');
    expect(outboxRows).toHaveLength(0);
    expect(created).toHaveLength(1);
    expect(created[0].channel).toBe('inapp');
  });

  it('channels:[email] → outbox 엔트리만, notifications 없음, 반환 빈 배열', async () => {
    const u = await seedUser(db, { email: 'b@x.com' });
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
        channels: ['email'],
        type: 'bid.submitted',
        title: 't',
        body: 'b',
        email: {
          event: 'bid.submitted',
          subject: 's',
          html: '<p>h</p>',
          dedupeKey: (e) => `k:${e}`,
        },
      }),
    );
    const notifRows = await db.select().from(notifications);
    const outboxRows = await db.select().from(outboxEntries);
    expect(notifRows).toHaveLength(0);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].toAddr).toBe('b@x.com');
    expect(outboxRows[0].dedupeKey).toBe('k:b@x.com');
    expect(created).toHaveLength(0);
  });

  it('channels:[inapp,email] 다중 recipient → 각자 row+outbox, dedupeKey는 수신자별', async () => {
    const u1 = await seedUser(db, { email: 'c1@x.com' });
    const u2 = await seedUser(db, { email: 'c2@x.com' });
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [
          { userId: u1.id, workspaceId: 'ws1', email: u1.email },
          { userId: u2.id, workspaceId: 'ws1', email: u2.email },
        ],
        channels: ['inapp', 'email'],
        type: 'rfp.awarded',
        title: 't',
        body: 'b',
        email: {
          event: 'rfp.awarded',
          subject: 's',
          html: '<p>h</p>',
          dedupeKey: (e) => `rfp:1:awarded:${e}`,
        },
      }),
    );
    const notifRows = await db.select().from(notifications);
    const outboxRows = await db.select().from(outboxEntries);
    expect(notifRows).toHaveLength(2);
    expect(outboxRows).toHaveLength(2);
    expect(created).toHaveLength(2);
    expect(outboxRows.map((r) => r.dedupeKey).sort()).toEqual([
      'rfp:1:awarded:c1@x.com',
      'rfp:1:awarded:c2@x.com',
    ]);
  });

  it('channels:[] → no-op (row·outbox 모두 없음, 빈 배열 반환)', async () => {
    const u = await seedUser(db, { email: 'd@x.com' });
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
        channels: [],
        type: 't',
        title: 't',
        body: 'b',
      }),
    );
    expect(await db.select().from(notifications)).toHaveLength(0);
    expect(await db.select().from(outboxEntries)).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('email 채널인데 email 페이로드 없으면 throw', async () => {
    const u = await seedUser(db, { email: 'e@x.com' });
    await expect(
      db.transaction((tx) =>
        notify(tx, {
          recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
          channels: ['email'],
          type: 't',
          title: 't',
          body: 'b',
        }),
      ),
    ).rejects.toThrow(/email/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node20 pnpm test lib/server/notifications/__tests__/notify.test.ts`
Expected: FAIL — `notify` 모듈/export 없음 (Cannot find module '../notify' 또는 notify is not a function)

> 참고: 이 저장소 테스트 실행 prefix는 `node20 pnpm test <path>` (Node 20 필요). RED/GREEN 은 항상 단일 파일로 빠르게 확인.

- [ ] **Step 3: `notify.ts` 최소 구현**

`lib/server/notifications/notify.ts`:

```ts
/**
 * 통합 알림 팬아웃. 수신자마다 channels 에 따라 in-app row insert(dispatchNotification)
 * 와 email outbox enqueue 를 tx 안에서 수행하고, 생성한 in-app Notification[] 을
 * 반환한다. 호출자는 반환값을 pendingEmits 에 모아 commit 후 emitAfterCommit 한다.
 *
 * 채널은 호출 단위로 모든 recipient 에 적용된다. 수신자별 채널 차이나 채널별
 * 수신자 집합 차이는 notify() 를 여러 번 호출해 표현한다.
 */
import { randomUUID } from 'node:crypto';
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { dispatchNotification } from './dispatch';
import type { Notification } from '@/lib/types/notification';
import type { Tx } from '@/lib/server/repositories/types';
import type { OutboxEvent } from '@/lib/server/outbox/types';

export type NotifyChannel = 'inapp' | 'email';

export type NotifyRecipient = {
  userId: string;
  workspaceId: string | null;
  email: string;
};

export type NotifyEmail = {
  event: OutboxEvent;
  subject: string;
  html: string;
  /** 수신자 email 로부터 파생. 생략 시 dedupeKey 없음. */
  dedupeKey?: (email: string) => string;
  /** digest 코얼레싱용 미래 시각. 생략 시 즉시 발송. */
  scheduledAt?: Date;
};

export type NotifyInput = {
  recipients: NotifyRecipient[];
  channels: NotifyChannel[];
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
  email?: NotifyEmail;
};

export async function notify(tx: Tx, input: NotifyInput): Promise<Notification[]> {
  const wantInapp = input.channels.includes('inapp');
  const wantEmail = input.channels.includes('email');
  if (wantEmail && !input.email) {
    throw new Error('notify: channels includes "email" but no email payload was provided');
  }

  const created: Notification[] = [];
  const outbox = wantEmail ? await getOutboxRepo() : null;

  for (const r of input.recipients) {
    if (wantInapp) {
      const n: Notification = {
        id: randomUUID(),
        userId: r.userId,
        workspaceId: r.workspaceId,
        type: input.type,
        title: input.title,
        body: input.body,
        channel: 'inapp',
        status: 'pending',
        ...(input.linkUrl ? { linkUrl: input.linkUrl } : {}),
        createdAt: new Date().toISOString(),
      };
      await dispatchNotification(tx, n);
      created.push(n);
    }
    if (wantEmail && input.email && outbox) {
      await outbox.enqueue(
        {
          event: input.email.event,
          to: r.email,
          subject: input.email.subject,
          html: input.email.html,
          ...(input.email.dedupeKey ? { dedupeKey: input.email.dedupeKey(r.email) } : {}),
          ...(input.email.scheduledAt ? { scheduledAt: input.email.scheduledAt } : {}),
        },
        tx,
      );
    }
  }

  return created;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node20 pnpm test lib/server/notifications/__tests__/notify.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/server/notifications/notify.ts lib/server/notifications/__tests__/notify.test.ts
git commit -m "feat(notify): 통합 알림 팬아웃 API notify() 추가

채널 명시(inapp/email) 단일 진입점. 수신자마다 dispatchNotification +
outboxRepo.enqueue 를 tx 안에서 수행하고 생성한 in-app Notification[] 반환.
DDL 0, 신규 repo 0. dispatch.ts/bus.ts/emitAfterCommit 불변.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `award` 마이그레이션 (rfp.ts) — 승자 both / 패자 in-app, 필터 통일

**Files:**
- Modify: `lib/server/services/rfp.ts` — `award` 알림 섹션 (현재 lines 145–207)
- Test: `lib/server/actions/notifications/__tests__/dispatchIntegration.test.ts` (기존 award 테스트 = behavior gate) + 이 파일에 필터 델타 단언 추가

**Interfaces:**
- Consumes: `notify` (Task 1), `this.workspaceRepo.memberRecipientsBatch(wsIds, tx)` → `{ workspaceId, userId, role, approvalStatus, email }[]` (기존), `renderRfpAwarded` (기존).

- [ ] **Step 1: baseline GREEN 확인**

Run: `node20 pnpm test lib/server/actions/notifications/__tests__/dispatchIntegration.test.ts`
Expected: PASS (3 tests) — 전환 전 기준선.

- [ ] **Step 2: 필터 델타 문서화 단언 추가 (RED)**

`dispatchIntegration.test.ts`의 award 테스트(`awardRfpAction emits winner + loser ...`) 끝( `expect(recvLoser[0].type).toBe('rfp.rejected');` 다음 줄)에 winner 이메일 outbox 검증을 추가한다. 파일 상단 import 에 스키마/헬퍼를 추가:

```ts
// (파일 상단 import 블록에 추가)
import { outboxEntries } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
```

award 테스트 말미에:

```ts
    // 통합 후: winner 이메일은 memberRecipientsBatch(notifiableAccount) 경유.
    // 실계정 winnerUser 는 두 필터 모두 통과 → 이메일 1건 enqueue (델타 0 확인).
    const winnerOutbox = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.awarded'));
    expect(winnerOutbox).toHaveLength(1);
    expect(winnerOutbox[0].toAddr).toBe('w@toss.im');
    expect(winnerOutbox[0].dedupeKey).toBe(`rfp:${rfpId}:awarded:w@toss.im`);
```

Run: `node20 pnpm test lib/server/actions/notifications/__tests__/dispatchIntegration.test.ts`
Expected: PASS (기존 코드도 동일 outbox 를 만들므로 이 단언은 전환 전에도 통과 — characterization). **전환 후에도 반드시 그린 유지**되어야 한다. (기존 award 이메일은 `memberEmails`(isSystemAccount) 였고 winnerUser 는 그 필터도 통과하므로 현재도 1건. 이 단언이 전환 후 필터 회귀를 잡는다.)

> 이 사이트는 신규 "행동"이 아니라 필터 통일이므로, characterization 단언(전후 동일)이 올바른 TDD 형태다.

- [ ] **Step 3: award 알림 섹션 전환**

`lib/server/services/rfp.ts`의 lines 145–207 (memberIdsMap 조회 ~ loser 루프)을 아래로 교체:

```ts
      // Batch-fetch recipients (userId + email) for winner + all unique loser
      // workspaces in a single IN-query, grouped by workspace.
      const allPgWsIds = [winner.pgWsId, ...loserWsIds];
      const recipientRows = await this.workspaceRepo.memberRecipientsBatch(allPgWsIds, tx);
      const recipientsByWs = new Map<string, { userId: string; email: string }[]>();
      for (const row of recipientRows) {
        const list = recipientsByWs.get(row.workspaceId) ?? [];
        list.push({ userId: row.userId, email: row.email });
        recipientsByWs.set(row.workspaceId, list);
      }

      // winner: in-app + email per member
      const winnerRecipients = (recipientsByWs.get(winner.pgWsId) ?? []).map((m) => ({
        userId: m.userId,
        workspaceId: winner.pgWsId,
        email: m.email,
      }));
      const awardedHtml = await renderRfpAwarded({
        rfpId: rfpCode,
        rfpTitle: rfp.title,
        bidId: awardedBidId,
        settlementCycle: winner.settleCycle,
      });
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: winnerRecipients,
          channels: ['inapp', 'email'],
          type: 'rfp.awarded',
          title: `[${rfpCode}] 선정됐어요`,
          body: '보내신 견적이 최종 선정됐어요.',
          linkUrl: `/inbox/${rfpCode}`,
          email: {
            event: 'rfp.awarded',
            subject: `[Supporter B · ${rfpCode}] 선정 결과`,
            html: awardedHtml,
            dedupeKey: (email) => `rfp:${rfpId}:awarded:${email}`,
          },
        })),
      );

      // losers: in-app only — iterate unique workspaces to avoid duplicates
      for (const loserWsId of loserWsIds) {
        const loserRecipients = (recipientsByWs.get(loserWsId) ?? []).map((m) => ({
          userId: m.userId,
          workspaceId: loserWsId,
          email: m.email,
        }));
        pendingEmits.push(
          ...(await notify(tx, {
            recipients: loserRecipients,
            channels: ['inapp'],
            type: 'rfp.rejected',
            title: `[${rfpCode}] 이번엔 선정되지 않았어요`,
            body: '다른 PG가 선정됐어요.',
            linkUrl: `/inbox/${rfpCode}`,
          })),
        );
      }
```

파일 상단 import 에 `notify` 추가(없다면): `import { notify } from '@/lib/server/notifications/notify';`

- [ ] **Step 4: 전환 후 GREEN 확인**

Run: `node20 pnpm test lib/server/actions/notifications/__tests__/dispatchIntegration.test.ts lib/server/services/__tests__/rfp.test.ts lib/server/actions/rfp/__tests__/award.test.ts`
Expected: PASS (award emit 카운트/타입 + winner outbox 단언 유지)

- [ ] **Step 5: 커밋**

```bash
git add lib/server/services/rfp.ts lib/server/actions/notifications/__tests__/dispatchIntegration.test.ts
git commit -m "refactor(rfp): award 알림을 notify() 로 전환 (승자 both / 패자 in-app)

winner/loser 수신자를 memberRecipientsBatch 로 통합 조회. award 이메일
필터가 memberEmails(isSystemAccount) → notifiableAccount 로 통일되어
나머지 사이트와 일치(실계정 대상 델타 0, characterization 단언으로 고정).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: rfp.ts in-app-only 사이트 4곳 전환 (cancel/close/rejectPgRequest/createPgRequest)

**Files:**
- Modify: `lib/server/services/rfp.ts` — cancel(현재 ~247–286), close(~330–355), rejectPgRequest(~375–391), createPgRequest(~442–458)
- Test: `lib/server/actions/rfp/__tests__/cancel.test.ts`, `close.test.ts`, `pg-request.test.ts` (behavior gate)

**Interfaces:**
- Consumes: `notify`, `this.workspaceRepo.memberRecipientsBatch` (cancel/close), `this.workspaceRepo.memberRecipients(wsId, tx)` → `{userId,email}[]` (rejectPgRequest/createPgRequest).

- [ ] **Step 1: baseline GREEN 확인**

Run: `node20 pnpm test lib/server/actions/rfp/__tests__/cancel.test.ts lib/server/actions/rfp/__tests__/close.test.ts lib/server/actions/rfp/__tests__/pg-request.test.ts`
Expected: PASS — 전환 전 기준선.

- [ ] **Step 2: cancel 전환**

`rfp.ts` cancel 의 `cancelMemberMap` 조회 + 이중 for 루프(현재 ~256–286)를 교체:

```ts
      const cancelRecipientRows = await this.workspaceRepo.memberRecipientsBatch(submittedPgWsIds, tx);
      const cancelByWs = new Map<string, { userId: string; email: string }[]>();
      for (const row of cancelRecipientRows) {
        const list = cancelByWs.get(row.workspaceId) ?? [];
        list.push({ userId: row.userId, email: row.email });
        cancelByWs.set(row.workspaceId, list);
      }
      for (const pgWsId of submittedPgWsIds) {
        const recipients = (cancelByWs.get(pgWsId) ?? []).map((m) => ({
          userId: m.userId,
          workspaceId: pgWsId,
          email: m.email,
        }));
        pendingEmits.push(
          ...(await notify(tx, {
            recipients,
            channels: ['inapp'],
            type: 'rfp.cancelled',
            title: `[${rfpCode}] 취소됨`,
            body: '구매사가 견적 요청을 취소했어요.',
            linkUrl: `/inbox/${rfpCode}`,
          })),
        );
      }
```

- [ ] **Step 3: close 전환**

`rfp.ts` close 의 `closeMemberMap` 조회 + 이중 for 루프(현재 ~330–355)를 교체(cancel 과 동형, type/title/body 만 close 값):

```ts
      const closeRecipientRows = await this.workspaceRepo.memberRecipientsBatch(submittedPgWsIds, tx);
      const closeByWs = new Map<string, { userId: string; email: string }[]>();
      for (const row of closeRecipientRows) {
        const list = closeByWs.get(row.workspaceId) ?? [];
        list.push({ userId: row.userId, email: row.email });
        closeByWs.set(row.workspaceId, list);
      }
      for (const pgWsId of submittedPgWsIds) {
        const recipients = (closeByWs.get(pgWsId) ?? []).map((m) => ({
          userId: m.userId,
          workspaceId: pgWsId,
          email: m.email,
        }));
        pendingEmits.push(
          ...(await notify(tx, {
            recipients,
            channels: ['inapp'],
            type: 'rfp.closed',
            title: `[${rfpCode}] 마감됨`,
            body: '구매사가 견적 요청을 마감했어요.',
            linkUrl: `/inbox/${rfpCode}`,
          })),
        );
      }
```

- [ ] **Step 4: rejectPgRequest 전환**

`rfp.ts` rejectPgRequest 의 `pgMemberIds` for 루프(현재 ~375–391)를 교체. **linkUrl 없음**에 주의:

```ts
      const rejectRecipients = (await this.workspaceRepo.memberRecipients(req.pgWsId, tx)).map((m) => ({
        userId: m.userId,
        workspaceId: req.pgWsId,
        email: m.email,
      }));
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: rejectRecipients,
          channels: ['inapp'],
          type: 'pg.request.rejected',
          title: `[${rfpRow.code}] 참여 요청 마감`,
          body: '아쉽지만 이번 RFP에는 참여가 어려워요.',
        })),
      );
```

- [ ] **Step 5: createPgRequest 전환**

`rfp.ts` createPgRequest 의 `buyerMemberIds` for 루프(현재 ~442–458)를 교체. **linkUrl `/rfp/${rfpCode}` 유지**:

```ts
      const createReqRecipients = (await this.workspaceRepo.memberRecipients(rfpRow.buyerWsId, tx)).map((m) => ({
        userId: m.userId,
        workspaceId: rfpRow.buyerWsId,
        email: m.email,
      }));
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: createReqRecipients,
          channels: ['inapp'],
          type: 'pg.request.received',
          title: `[${rfpCode}] 새 참여 요청`,
          body: `${pgWsName}가 이 견적 요청에 참여를 요청했어요.`,
          linkUrl: `/rfp/${rfpCode}`,
        })),
      );
```

- [ ] **Step 6: 전환 후 GREEN 확인**

Run: `node20 pnpm test lib/server/actions/rfp/__tests__/cancel.test.ts lib/server/actions/rfp/__tests__/close.test.ts lib/server/actions/rfp/__tests__/pg-request.test.ts lib/server/services/__tests__/rfp.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/server/services/rfp.ts
git commit -m "refactor(rfp): in-app-only 알림 4곳(cancel/close/reject·createPgRequest)을 notify() 로 전환

memberRecipientsBatch/memberRecipients(notifiableAccount, 필터 동일)로
조회 후 channels:['inapp'] 단일 호출. linkUrl 유무(reject 무·create 유)
보존.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: rfp.ts both-channel 사이트 3곳 전환 (acceptPgRequest/sendDraftInvitations/requote)

**Files:**
- Modify: `lib/server/services/rfp.ts` — acceptPgRequest(~519–558), sendDraftInvitations(~663–712), requote(~824–854)
- Test: `lib/server/actions/rfp/__tests__/pg-request.test.ts`, `lib/server/services/__tests__/rfp.test.ts`, `lib/server/services/__tests__/requote.test.ts`

**Interfaces:**
- Consumes: `notify`, `this.workspaceRepo.memberRecipients(wsId, tx)`, `this.workspaceRepo.adminRecipients(wsId, tx)`, `membersByWs`(sendDraftInvitations 기존 그룹핑), `renderRfpInvited`(기존).
- **주의**: acceptPgRequest·sendDraftInvitations 는 **in-app 수신자(전체 멤버) ≠ email 수신자(admin)** 이므로 `notify()`를 채널별로 2회 호출한다.

- [ ] **Step 1: baseline GREEN 확인**

Run: `node20 pnpm test lib/server/actions/rfp/__tests__/pg-request.test.ts lib/server/services/__tests__/requote.test.ts lib/server/services/__tests__/rfp.test.ts`
Expected: PASS — 기준선.

- [ ] **Step 2: acceptPgRequest 전환 (email=admin 2회 호출 → in-app=all)**

acceptPgRequest 의 email(현재 ~519–539) + in-app(~542–558) 두 블록을 교체. **email 은 admin 수신자, in-app 은 전체 멤버 — 두 notify 호출**. email `dedupeKey` 는 recipient 의 userId 를 포함하므로 recipient 에 userId 가 있어야 하지만 `dedupeKey:(email)=>...`는 email 만 받는다 → 기존 dedupeKey 는 `...user:${admin.userId}`를 쓰므로, **admin 이메일 전용 notify 는 recipient 당 dedupeKey 가 userId 기반**이다. 이 경우 email dedupeKey 를 email 기반으로 바꾸면 값이 달라져 behavior 변경이 된다. 따라서 이 사이트의 email 은 recipient.userId 가 필요 → admin 루프를 유지하되 각 admin 을 단일-recipient notify(email) 로 호출한다:

```ts
        const deadlineDisplay = new Date(rfpRow.deadline)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 16);
        const adminRows = await this.workspaceRepo.adminRecipients(req.pgWsId, tx);
        for (const admin of adminRows) {
          const inviteUrl = `${baseUrlFor('pg')}/invite/rfp/${rawToken}`;
          const html = await renderRfpInvited({
            rfpId: rfpRow.code,
            rfpTitle: rfpRow.title,
            buyerName,
            deadline: deadlineDisplay,
            inviteUrl,
          });
          await notify(tx, {
            recipients: [{ userId: admin.userId, workspaceId: req.pgWsId, email: admin.email }],
            channels: ['email'],
            type: 'rfp.invited',
            title: '',
            body: '',
            email: {
              event: 'rfp.invited',
              subject: `[Supporter B · ${rfpRow.code}] 견적 요청이 도착했어요`,
              html,
              dedupeKey: () => `rfp:${req.rfpId}:invite:ws:${req.pgWsId}:user:${admin.userId}`,
            },
          });
        }
```

> `dedupeKey: () => ...userId...` — email 인자를 무시하고 admin.userId 로 고정(단일-recipient 이므로 안전). in-app 은 아래 all-member 호출이 담당하므로 이 email 전용 notify 의 title/body 는 사용되지 않는다(빈 문자열).

그다음 in-app(전체 멤버) 블록:

```ts
      const acceptRecipients = (await this.workspaceRepo.memberRecipients(req.pgWsId, tx)).map((m) => ({
        userId: m.userId,
        workspaceId: req.pgWsId,
        email: m.email,
      }));
      pendingEmits.push(
        ...(await notify(tx, {
          recipients: acceptRecipients,
          channels: ['inapp'],
          type: 'pg.request.accepted',
          title: `[${rfpRow.code}] 참여 요청 수락됨`,
          body: `${buyerName}가 참여 요청을 수락했어요. 이제 견적을 보낼 수 있어요.`,
          linkUrl: `/inbox/${rfpRow.code}`,
        })),
      );
```

- [ ] **Step 3: sendDraftInvitations 전환 (in-app=all members, email=admins)**

in-app 블록(현재 ~663–681)을 교체 — `membersByWs` 그룹을 recipient 로:

```ts
      for (const pgWsId of uniquePgWsIds) {
        const members = membersByWs.get(pgWsId) ?? [];
        const recipients = members.map((m) => ({
          userId: m.userId,
          workspaceId: pgWsId,
          email: m.email,
        }));
        pendingEmits.push(
          ...(await notify(tx, {
            recipients,
            channels: ['inapp'],
            type: 'rfp.invited',
            title: `[${rfpCode}] 견적 요청이 도착했어요`,
            body: `${buyerName}가 견적을 요청했어요.`,
            linkUrl: `/inbox/${rfpCode}`,
          })),
        );
      }
```

email(admin) 블록(현재 ~699–712)을 교체 — admin 별 단일-recipient email notify(dedupeKey 가 userId 기반이므로 acceptPgRequest 와 동일 패턴):

```ts
        const wsMembers = membersByWs.get(draft.pgWsId) ?? [];
        const admins = wsMembers.filter((m) => m.role === 'admin' && m.approvalStatus === 'approved');
        for (const admin of admins) {
          await notify(tx, {
            recipients: [{ userId: admin.userId, workspaceId: draft.pgWsId, email: admin.email }],
            channels: ['email'],
            type: 'rfp.invited',
            title: '',
            body: '',
            email: {
              event: 'rfp.invited',
              subject: `[Supporter B · ${rfpCode}] 견적 요청이 도착했어요`,
              html,
              dedupeKey: () => `rfp:${rfpRow.id}:invite:ws:${draft.pgWsId}:user:${admin.userId}`,
            },
          });
        }
```

- [ ] **Step 4: requote 전환 (in-app + email, 수신자 동일=admin)**

requote 의 admin 루프(현재 ~824–854)를 교체. **in-app 과 email 수신자가 동일(admin) 이고 dedupeKey 가 userId 기반**이므로 admin 별 단일-recipient notify 로 두 채널 함께:

```ts
      for (const p of plans) {
        const adminRows = await this.workspaceRepo.adminRecipients(p.pgWsId, tx);
        for (const m of adminRows) {
          pendingEmits.push(
            ...(await notify(tx, {
              recipients: [{ userId: m.userId, workspaceId: p.pgWsId, email: m.email }],
              channels: ['inapp', 'email'],
              type: 'rfp.requote_requested',
              title: `[${rfp.code}] 견적 재요청이 도착했어요`,
              body: `${buyerName}가 조건 개선을 요청했어요.`,
              linkUrl: `/inbox/${rfp.code}`,
              email: {
                event: 'rfp.requote_requested',
                subject: `[Supporter B · ${rfp.code}] 견적 재요청이 도착했어요`,
                html,
                dedupeKey: () => `rfp:${rfpId}:requote:ws:${p.pgWsId}:round:${p.round}:user:${m.userId}`,
              },
            })),
          );
        }
      }
```

- [ ] **Step 5: 전환 후 GREEN 확인**

Run: `node20 pnpm test lib/server/actions/rfp/__tests__/pg-request.test.ts lib/server/services/__tests__/requote.test.ts lib/server/services/__tests__/rfp.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/server/services/rfp.ts
git commit -m "refactor(rfp): both-channel 알림 3곳(accept·sendDraftInvitations·requote)을 notify() 로 전환

채널별 수신자 상이(email=admin, in-app=전체 멤버)는 채널별 notify 2회로
표현. dedupeKey 가 userId 기반인 admin 이메일은 단일-recipient notify 로
값 보존.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: bid.ts `submitBid` 전환

**Files:**
- Modify: `lib/server/services/bid.ts` — submitBid 알림 섹션 (현재 ~206–241, `if (!rfp.isSample)` 블록 내부)
- Test: `lib/server/actions/bid/__tests__/submitBid.test.ts`, `lib/server/services/__tests__/bidSubmit.test.ts`, `lib/server/services/__tests__/bid.test.ts`, `dispatchIntegration.test.ts`

**Interfaces:**
- Consumes: `notify`, `this.workspaceRepo.memberRecipients(rfp.buyerWsId, tx)`(기존, in-app+email 동일 수신자), `renderBidSubmitted`(기존).

- [ ] **Step 1: baseline GREEN 확인**

Run: `node20 pnpm test lib/server/actions/bid/__tests__/submitBid.test.ts lib/server/services/__tests__/bidSubmit.test.ts lib/server/actions/notifications/__tests__/dispatchIntegration.test.ts`
Expected: PASS

- [ ] **Step 2: submitBid 알림 블록 전환**

`if (!rfp.isSample) {` 내부의 for 루프(현재 ~217–240)를 교체. **dedupeKey 가 `bid:${rfpId}:${wsId}:${m.userId}`로 userId 기반**이므로 buyer member 별 단일-recipient notify:

```ts
      if (!rfp.isSample) {
        const buyerMembers = await this.workspaceRepo.memberRecipients(rfp.buyerWsId, tx);
        const pgWsLabel = (await this.workspaceRepo.getName(actor.workspaceId, tx)) ?? 'PG';
        const submittedHtml = await renderBidSubmitted({
          rfpId: rfp.code,
          rfpTitle: rfp.title,
          pgName: pgWsLabel,
          submittedAt: now.toISOString().replace('T', ' ').slice(0, 16),
        });

        for (const m of buyerMembers) {
          pendingEmits.push(
            ...(await notify(tx, {
              recipients: [{ userId: m.userId, workspaceId: rfp.buyerWsId, email: m.email }],
              channels: ['inapp', 'email'],
              type: 'bid.submitted',
              title: `[${rfp.code}] ${pgWsLabel} 견적이 도착했어요`,
              body: `${pgWsLabel}가 견적을 보냈어요.`,
              linkUrl: `/rfp/${rfp.code}`,
              email: {
                event: 'bid.submitted',
                subject: `[Supporter B · ${rfp.code}] ${pgWsLabel} 견적이 도착했어요`,
                html: submittedHtml,
                dedupeKey: () => `bid:${input.rfpId}:${actor.workspaceId}:${m.userId}`,
              },
            })),
          );
        }
      }
```

파일 상단에 `import { notify } from '@/lib/server/notifications/notify';` 추가.

- [ ] **Step 3: 전환 후 GREEN 확인**

Run: `node20 pnpm test lib/server/actions/bid/__tests__/submitBid.test.ts lib/server/services/__tests__/bidSubmit.test.ts lib/server/services/__tests__/bid.test.ts lib/server/actions/notifications/__tests__/dispatchIntegration.test.ts`
Expected: PASS (dispatchIntegration 의 submitBid emit 카운트 2 유지)

- [ ] **Step 4: 커밋**

```bash
git add lib/server/services/bid.ts
git commit -m "refactor(bid): submitBid 알림을 notify() 로 전환

buyer member 별 in-app+email 을 단일-recipient notify 로 통합
(dedupeKey userId 기반 보존). isSample 억제 그대로.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: chat.ts `sendMessage` 전환 (수신자별 조건부 채널)

**Files:**
- Modify: `lib/server/services/chat.ts` — sendMessage recipient 루프 (현재 ~205–243)
- Test: `lib/server/services/__tests__/chat.test.ts`, `lib/server/actions/chat/__tests__/sendChatMessage.test.ts`

**Interfaces:**
- Consumes: `notify`, `this.notifRepo.hasPendingChatNotification`, `isUserPresentInConversation`(기존), 루프 밖에서 계산된 `senderName`/`preview`/`html`/`digestScheduledAt`/`inappWindowStart`(기존).
- **주의**: 수신자마다 in-app(dedupe 미충족 시)·email(대화방 부재 시) 채널이 다르다 → recipient 당 채널을 계산해 단일-recipient notify 1회.

- [ ] **Step 1: baseline GREEN 확인**

Run: `node20 pnpm test lib/server/services/__tests__/chat.test.ts lib/server/actions/chat/__tests__/sendChatMessage.test.ts`
Expected: PASS

- [ ] **Step 2: recipient 루프 전환**

현재 for 루프(~205–243)를 교체:

```ts
      for (const m of recipients) {
        if (m.userId === actor.userId) continue;

        const channels: NotifyChannel[] = [];
        const alreadyNotified = await this.notifRepo.hasPendingChatNotification(
          m.userId,
          counterpartyWsId,
          inappWindowStart,
          tx,
        );
        if (!alreadyNotified) channels.push('inapp');
        const present = await isUserPresentInConversation(conv.id, m.userId);
        if (!present) channels.push('email');

        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [{ userId: m.userId, workspaceId: counterpartyWsId, email: m.email }],
            channels,
            type: 'chat.message',
            title: `${senderName}님의 새 메시지`,
            body: preview,
            linkUrl: '/messages',
            email: {
              event: 'chat.message',
              subject: `[Supporter B] ${senderName}님의 새 메시지`,
              html,
              dedupeKey: () => chatDigestDedupeKey(conv.id, m.userId, now),
              scheduledAt: digestScheduledAt,
            },
          })),
        );
      }
```

파일 상단에 `import { notify, type NotifyChannel } from '@/lib/server/notifications/notify';` 추가.

> in-app 미충족(alreadyNotified) 이고 대화방에 present 면 `channels=[]` → notify no-op. email 만 필요하면 `['email']` — email 페이로드는 항상 제공되므로 안전. dedupeKey 는 `m.userId`/`conv.id`/`now` 기반이라 email 인자를 무시하고 고정.

- [ ] **Step 3: 전환 후 GREEN 확인**

Run: `node20 pnpm test lib/server/services/__tests__/chat.test.ts lib/server/actions/chat/__tests__/sendChatMessage.test.ts`
Expected: PASS (in-app dedupe / email presence 조건 조합 보존)

- [ ] **Step 4: 커밋**

```bash
git add lib/server/services/chat.ts
git commit -m "refactor(chat): sendMessage 알림을 notify() 로 전환 (수신자별 조건부 채널)

in-app(dedupe 윈도우)·email(대화방 부재) 판정은 서비스에 유지하고,
결과를 channels 배열로 접어 단일-recipient notify 1회. digest
scheduledAt/dedupeKey 보존.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: team-chat.ts `sendMessage` 전환 (mention/generic + digest)

**Files:**
- Modify: `lib/server/services/team-chat.ts` — sendMessage recipient 루프 (현재 ~176–241)
- Test: `lib/server/services/__tests__/team-chat.test.ts`, `lib/server/actions/chat/__tests__/sendTeamMessage.test.ts`

**Interfaces:**
- Consumes: `notify`, `this.notifRepo.hasPendingTeamNotification`/`hasPendingTeamMentionNotification`, `this.userRepo.findById`(email 조회), `teamDigestDedupeKey`/`teamDigestWindowEnd`(기존), `mentioned` set, `windowStart`(기존).
- **주의**: in-app 은 mention/generic 분기(각기 다른 type/title/dedupe), email 은 (generic·mention 둘 다 없을 때) 1회 digest. email 수신자의 email 은 `userRepo.findById` 로 조회. mention 인 경우 in-app type=`team_chat.mention`, 아니면 `team_chat.message`. **이 사이트는 in-app 과 email 이 서로 다른 게이트 조건**이라 채널별로 분리 호출한다.

- [ ] **Step 1: baseline GREEN 확인**

Run: `node20 pnpm test lib/server/services/__tests__/team-chat.test.ts lib/server/actions/chat/__tests__/sendTeamMessage.test.ts`
Expected: PASS

- [ ] **Step 2: recipient 루프 전환**

현재 for 루프(~176–241)를 교체. in-app 은 mention/generic 게이트별 `notify(['inapp'])`, email 은 `!hadGeneric && !hadMention` 게이트에서 `notify(['email'])`:

```ts
      for (const memberId of recipientIds) {
        if (memberId === actor.userId) continue;

        const hadGeneric = await this.notifRepo.hasPendingTeamNotification(
          memberId, input.rfpId, windowStart, tx,
        );
        const hadMention = await this.notifRepo.hasPendingTeamMentionNotification(
          memberId, input.rfpId, windowStart, tx,
        );

        if (mentioned.has(memberId)) {
          if (!hadMention) {
            pendingEmits.push(
              ...(await notify(tx, {
                recipients: [{ userId: memberId, workspaceId: actor.workspaceId, email: '' }],
                channels: ['inapp'],
                type: 'team_chat.mention',
                title: `${authorName}님이 회원님을 언급했어요`,
                body: preview,
                linkUrl: `/messages?t=${input.rfpId}`,
              })),
            );
          }
        } else {
          if (!hadGeneric) {
            pendingEmits.push(
              ...(await notify(tx, {
                recipients: [{ userId: memberId, workspaceId: actor.workspaceId, email: '' }],
                channels: ['inapp'],
                type: 'team_chat.message',
                title: `${authorName}님의 팀 메시지`,
                body: preview,
                linkUrl: `/messages?t=${input.rfpId}`,
              })),
            );
          }
        }

        // 이메일 digest — (rfp, workspace, recipient) 윈도당 1회. 첫 팀 알림 발생
        // 시점에만 enqueue(outbox dedupeKey UNIQUE 로 coalesce).
        if (!hadGeneric && !hadMention) {
          const member = await this.userRepo.findById(memberId, tx);
          if (member?.email) {
            await notify(tx, {
              recipients: [{ userId: memberId, workspaceId: actor.workspaceId, email: member.email }],
              channels: ['email'],
              type: 'team_chat.message',
              title: '',
              body: '',
              email: {
                event: 'team_chat.message',
                subject: '[Supporter B] 새 팀 메시지',
                html: '<p>새 팀 메시지가 있어요.</p>', // placeholder — processor recomputes at send
                dedupeKey: () => teamDigestDedupeKey(input.rfpId, actor.workspaceId, memberId, now),
                scheduledAt: teamDigestWindowEnd(now),
              },
            });
          }
        }
      }
```

파일 상단에 `import { notify } from '@/lib/server/notifications/notify';` 추가.

> in-app notify recipient 의 `email: ''` 는 channels 가 `['inapp']` 뿐이라 사용되지 않는다(email 채널일 때만 `to` 로 쓰임). email digest notify 는 별도 `member.email` 로 호출.
> **behavior-preservation 취약 지점**: 이 사이트가 가장 특수하다(mention/generic 분리 dedupe + placeholder digest). Step 3 에서 team-chat 테스트가 하나라도 깨지면, 억지로 맞추지 말고 **team_chat email 만 기존 `outboxRepo.enqueue` 직접 호출로 되돌리고**(in-app 만 notify 전환), 이 사이트의 email 통합은 후속 PR 로 분리한다(스펙의 명시된 contingency).

- [ ] **Step 3: 전환 후 GREEN 확인**

Run: `node20 pnpm test lib/server/services/__tests__/team-chat.test.ts lib/server/actions/chat/__tests__/sendTeamMessage.test.ts`
Expected: PASS (mention vs generic in-app 분기, digest 1회 coalesce 보존)

- [ ] **Step 4: 커밋**

```bash
git add lib/server/services/team-chat.ts
git commit -m "refactor(team-chat): sendMessage 알림을 notify() 로 전환 (mention/generic + digest)

in-app mention/generic 게이트별 notify(['inapp']), email digest 는
notify(['email']) + scheduledAt/dedupeKey placeholder 보존.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 전체 검증 + 스펙 문서 정정

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-unified-notify-api-design.md` (repo 섹션 정정)

- [ ] **Step 1: 남은 `dispatchNotification` 직접 호출 없는지 확인**

Run: `grep -rn "dispatchNotification" lib/server/services/`
Expected: 결과 없음(모든 서비스가 notify() 경유). `dispatch.ts` 자체의 정의/`notify.ts` 의 import 만 남아야 한다:
Run: `grep -rn "dispatchNotification" lib/server/notifications/`
Expected: `dispatch.ts`(정의) + `notify.ts`(import·호출)만.

- [ ] **Step 2: 서비스 파일의 미사용 import 정리 확인**

각 서비스(rfp/bid/chat/team-chat)에서 `dispatchNotification` import 가 더 이상 쓰이지 않으면 제거. `Notification` 타입은 `pendingEmits: Notification[]` 로 계속 쓰이면 유지.

Run: `node20 pnpm tsc --noEmit`
Expected: 0 errors (미사용 import 는 lint 에서, 타입 불일치는 tsc 에서 잡힘)

- [ ] **Step 3: lint**

Run: `node20 pnpm lint`
Expected: 0 errors (미사용 `dispatchNotification`/`randomUUID` import 있으면 여기서 발견 → 제거)

- [ ] **Step 4: 전체 테스트**

Run: `node20 pnpm test`
Expected: 전부 GREEN. (참고: 이 저장소는 jsdom `localStorage` 등 사전존재 실패가 있을 수 있음 — origin/dev 에서도 동일하면 이 변경과 무관. 게이트는 이 계획이 건드린 notification/service/action 테스트의 GREEN + tsc 0 + lint 0.)

- [ ] **Step 5: 스펙 문서 repo 섹션 정정**

`docs/superpowers/specs/2026-07-01-unified-notify-api-design.md` 의 "## repo 추가" 섹션을 아래로 교체:

```markdown
## repo (신규 추가 불필요 — 기존 메서드 재사용)

통합 recipient(`{userId, email}`) 조회는 **이미 존재하는** 메서드로 충족된다.
모두 `notifiableAccount`(`passwordHash != '!'`) 필터를 적용한다.

- `WorkspaceRepo.memberRecipients(wsId): {userId, email}[]`
- `WorkspaceRepo.adminRecipients(wsId): {userId, email}[]` (admin + approved)
- `WorkspaceRepo.memberRecipientsBatch(wsIds): {workspaceId, userId, role, approvalStatus, email}[]` (award/cancel/close 의 다중 ws — 앱 레이어에서 wsId 로 그룹핑)

유일한 필터 변화: `award` 이메일이 `memberEmails`(isSystemAccount) → `memberRecipientsBatch`(notifiableAccount) 로 통일됨. 실계정 대상 델타 0(위 "확정" 참조).
```

- [ ] **Step 6: 커밋**

```bash
git add lib/server/services docs/superpowers/specs/2026-07-01-unified-notify-api-design.md
git commit -m "chore(notify): 미사용 import 정리 + 스펙 repo 섹션 정정(기존 메서드 재사용)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (작성자 체크)

**Spec coverage:**
- 통합 API(recipients/channels/emitAfterCommit 반환) → Task 1 ✓
- 스코프 경계(auth/invite 제외) → Global Constraints + 마이그레이션 대상에서 제외 ✓
- 11개 사이트 전부 → Task 2(award) + Task 3(cancel/close/reject·create, 4) + Task 4(accept/sendDraft/requote, 3) + Task 5(bid) + Task 6(chat) + Task 7(team_chat) = 1+4+3+1+1+1 = 11 ✓
- repo 통합 조회 → 기존 메서드 재사용(스펙보다 축소), Task 8 에서 스펙 정정 ✓
- isSystemAccount 필터 계승 → 기존 메서드가 `notifiableAccount` 사용, award 필터 델타 명시·테스트 ✓
- 원자성(tx 안 await, emit commit 후) → notify 구현 + emitAfterCommit 재사용 ✓
- TDD/behavior-preservation → 각 마이그레이션 baseline GREEN → 전환 → GREEN ✓
- team_chat digest contingency → Task 7 Step 2 note ✓

**Placeholder scan:** 코드 블록 모두 실제 코드. `title:''`/`body:''`(email-only notify)와 `email:''`(inapp-only recipient)는 의도적 미사용 필드로 주석 명시 — placeholder 아님. team_chat html `'<p>새 팀 메시지가 있어요.</p>'`는 원본 그대로의 placeholder(프로세서가 재계산) — 의도적.

**Type consistency:** `NotifyChannel`/`NotifyRecipient`/`NotifyEmail`/`NotifyInput`/`notify` 이름과 시그니처가 Task 1 정의와 Task 2–7 사용에서 일치. `memberRecipientsBatch` 반환 필드(workspaceId/userId/role/approvalStatus/email)와 그룹핑 사용 일치. `dedupeKey: (email) => string` 시그니처를 userId-기반 사이트에서는 `() => ...`(인자 무시)로 사용 — 타입 호환(인자 적은 함수는 할당 가능).

**주의(구현자용):** userId-기반 dedupeKey 사이트(accept/sendDraft/requote/bid/chat/team_chat digest)는 반드시 **단일-recipient notify** 로 호출해야 dedupeKey 값이 원본과 일치한다(다중 recipient + `()=>고정키` 는 outbox UNIQUE 충돌로 1건만 저장되는 회귀). 각 Task 코드가 이미 단일-recipient 로 되어 있으니 그대로 따를 것.

---

## Addendum — 실행 중 추가된 Task 7b (플랜 갭 보완)

구현 중 발견: 원래 탐색이 놓친 **12번째 알림 사이트** `createRfp`의 `if (send)` 경로가 `sendDraftInvitations`와 동일한 both-channel 초대 패턴(admin 이메일 per-admin + 전체 멤버 인앱)을 인라인으로 갖고 있었다. 이 사이트가 각 서비스의 `outboxRepo`/`dispatchNotification` 마지막 사용처였기 때문에, Task 5–7·7b 에서 마이그레이션 완료 후 해당 서비스(bid/chat/team-chat/rfp) 생성자의 **미사용 `outboxRepo` param 제거 + 모든 생성 사이트(factory·`_setup.ts`·테스트) 동기화**가 수반되었다(TS `noUnusedLocals`/TS6138 강제). 초안이 예상하지 못한 부수 작업이지만 behavior-preserving하며 각 태스크 리뷰에서 검증됨.

**최종 스코프**: 마이그레이션 12개 흐름 = award·cancel·close·rejectPgRequest·createPgRequest·acceptPgRequest·sendDraftInvitations·requote·**createRfp(send)** (rfp 9) + bid.submitBid + chat.sendMessage + team_chat.sendMessage. 범위 밖 유지(직접 outbox/dispatch): `auth.*`, `workspace.*`, `_workspaceInviteNotify.ts`.
