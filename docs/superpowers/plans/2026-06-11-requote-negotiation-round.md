# 견적 재요청(마감 전 협상 라운드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RFP가 진행 중(`sent`)일 때 구매사가 특정 PG를 골라 개선 요청 메시지 + 새 마감일과 함께 "견적 재요청"을 보내면, 그 PG가 라운드 이력을 보존하며 새 견적을 다시 제출할 수 있게 한다.

**Architecture:** 접근법 A — `bids`에 `round` 컬럼 추가(`UNIQUE(rfp,pg,round)`), 신규 `rfp_requote_requests` 테이블(cold-pitch `rfp_pg_requests` 패턴 차용). `RfpService.requote()`가 요청 레코드 생성·`rfps.deadline` 갱신·알림/이메일 팬아웃을 트랜잭션으로 소유하고, `BidService.submit()`은 "이미 제출함" 차단을 라운드 인지 분기로 교체한다. 구매사 `RequoteDialog` + PG 재요청 배너/prefill 폼이 UI.

**Tech Stack:** Next.js 16 App Router(RSC + server actions), Drizzle ORM + Postgres(push-only DDL), Vitest + PGlite(단위/통합), React Testing Library(컴포넌트), Playwright(e2e), @base-ui/react(다이얼로그/토스트), zod v4.

**Spec:** `docs/superpowers/specs/2026-06-11-requote-negotiation-round-design.md`

---

## 사전 주의 (모든 작업 공통)

1. **TDD 필수.** 각 Task는 실패 테스트 먼저 작성 → `pnpm test <path>`로 RED 확인 → 최소 구현 → GREEN → 커밋. RED를 직접 못 봤으면 그 테스트는 무효.
2. **단일 테스트 실행 명령** (node 20 PATH 권장):
   - 노드 프로젝트(서비스/리포/액션/스키마): `pnpm test --project unit-node <path>`
   - jsdom 프로젝트(컴포넌트): `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom <path>`
3. **워크트리 경로.** 모든 파일은 현재 워크트리(`.claude/worktrees/feat+requote-negotiation-round/`) 기준 상대경로. 절대경로 사용 시 메인 저장소를 건드리지 않도록 주의.
4. **생성자 변경 파급 (Task 6·7).** `RfpService`와 `BidService` 생성자에 새 repo 인자를 추가하면 아래 5개 호출부를 **모두** 같은 커밋에서 고쳐야 컴파일/테스트가 통과한다. 작업 전 확인:
   ```bash
   grep -rn "new RfpService(" lib/
   grep -rn "new BidService(" lib/
   ```
   알려진 사이트: `lib/server/services/rfp.ts`(getRfpService), `lib/server/services/bid.ts`(getBidService), `lib/server/services/__tests__/rfp.test.ts`(buildService), `lib/server/services/__tests__/bidSubmit.test.ts`, `lib/server/actions/rfp/__tests__/_setup.ts`(setupRfpActionEnv).
5. **e2e raw SQL 파급 (Task 2).** `bids`의 `UNIQUE(rfp_id, pg_ws_id)` → `UNIQUE(rfp_id, pg_ws_id, round)` 교체는 e2e의 raw `ON CONFLICT (rfp_id, pg_ws_id)`를 깨뜨린다. Task 2 마지막 스텝에서 grep 후 수정.

---

## File Structure

**신규 파일**
- `lib/db/schema/rfp-requote-requests.ts` — 재요청 테이블 정의
- `lib/types/rfp-requote-request.ts` — 도메인 타입
- `lib/server/repositories/drizzle/rfp-requote-request.ts` — Drizzle 리포 구현
- `lib/server/repositories/drizzle/__tests__/rfp-requote-request.test.ts` — 리포 테스트
- `lib/server/outbox/templates/rfpRequoteRequested.tsx` — 이메일 템플릿
- `lib/server/actions/rfp/requestRequoteAction.ts` — 액션
- `lib/server/actions/rfp/__tests__/requestRequote.test.ts` — 액션 테스트
- `lib/server/services/__tests__/requote.test.ts` — RfpService.requote 테스트
- `components/rfp/comparison/RequoteDialog.tsx` — 구매사 재요청 다이얼로그
- `components/rfp/comparison/__tests__/RequoteDialog.test.tsx` — 다이얼로그 테스트
- `components/inbox/RequoteBanner.tsx` — PG 재요청 배너
- `components/inbox/__tests__/RequoteBanner.test.tsx` — 배너 테스트
- `e2e/scenario-e-requote.spec.ts` — e2e 시나리오

**수정 파일**
- `lib/db/schema/_enums.ts` — `rfpRequoteRequestStatusEnum` 추가
- `lib/db/schema/bids.ts` — `round` 컬럼 + unique 교체
- `lib/db/schema/index.ts` — 신규 테이블 export
- `lib/types/bid.ts` — `Bid.round`
- `lib/server/repositories/types.ts` — `RfpRequoteRequestRepo` 인터페이스
- `lib/server/repositories/drizzle/bid.ts` — `BID_COLUMNS`·`rowToBid`·`save`에 round
- `lib/server/repositories/factory.ts` — 번들 + getter + 버전
- `lib/server/services/bid.ts` — submit 라운드 분기 + 생성자
- `lib/server/services/rfp.ts` — requote() + 생성자
- `lib/server/outbox/types.ts` — OutboxEvent
- `lib/server/outbox/templates/types.ts` — props 인터페이스
- `lib/server/rfp-detail-loader.ts` — current-bid(max round) 선택 + 재요청 정보 노출(buyer·PG)
- `lib/server/actions/rfp/index.ts` — 액션 re-export
- `components/rfp/comparison/FocusComparison.tsx` — 재요청 CTA + 라운드/상태 칩
- `components/rfp/RfpDetailContent.tsx` — 로더 신규 필드 전달
- `components/inbox/PgRfpDetailContent.tsx` — 재요청 시 prefill 폼 + 배너
- `components/inbox/bid-wizard/BidWizard.tsx` — `initialBid` prefill prop
- `lib/server/services/__tests__/rfp.test.ts`·`bidSubmit.test.ts`·`lib/server/actions/rfp/__tests__/_setup.ts` — 생성자 인자 추가

---

## Phase 1 — 데이터 모델 기반

### Task 1: `bids.round` 컬럼 + Bid 타입

**Files:**
- Modify: `lib/db/schema/bids.ts`
- Modify: `lib/types/bid.ts`
- Modify: `lib/server/repositories/drizzle/bid.ts`
- Test: `lib/server/repositories/drizzle/__tests__/bid.test.ts` (있으면 추가, 없으면 신규)

- [ ] **Step 1: 라운드 영속 실패 테스트 작성**

먼저 기존 bid 리포 테스트 위치 확인: `ls lib/server/repositories/drizzle/__tests__/ | grep bid`. 파일이 있으면 거기에, 없으면 `lib/server/repositories/drizzle/__tests__/bid.test.ts` 신규 생성. 테스트 추가:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { bids, rfpInvitations, rfps } from '@/lib/db/schema';
import {
  seedUser,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedRfp,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { DrizzleBidRepository } from '../bid';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

async function seedInvited(buyerWsId: string, createdBy: string, pgWsId: string) {
  const { id: rfpId, code } = await seedRfp(db, { buyerWsId, createdBy });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    status: 'accepted',
  });
  return { rfpId, code, invId };
}

describe('DrizzleBidRepository round', () => {
  it('persists round and exposes it via findByRfp; allows two rounds for one PG', async () => {
    const repo = new DrizzleBidRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const { rfpId, invId } = await seedInvited(buyerWs.id, buyer.id, pgWs.id);

    const base = {
      rfpId,
      pgWsId: pgWs.id,
      invitationId: invId,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: {},
      customFees: {},
      proposalPdfs: [],
      status: 'submitted' as const,
      submittedBy: buyer.id,
      submittedAt: new Date().toISOString(),
    };
    await repo.save({ id: randomUUID(), round: 1, ...base });
    await repo.save({ id: randomUUID(), round: 2, ...base });

    const rows = await repo.findByRfp(rfpId);
    expect(rows.map((b) => b.round).sort()).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/server/repositories/drizzle/__tests__/bid.test.ts`
Expected: FAIL — `round` 가 Bid 타입/스키마/projection에 없어 타입에러 또는 `round`가 undefined.

- [ ] **Step 3: 스키마에 round 추가 + unique 교체**

`lib/db/schema/bids.ts` 임포트에 `integer` 추가(없으면): `import { pgTable, uuid, text, integer, numeric, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';`

`updatedAt`(또는 `submittedAt`) 컬럼 바로 앞에 추가:
```typescript
    round: integer('round').notNull().default(1),
```

constraint 배열에서 기존 줄을 교체:
```typescript
    // 변경 전: unique('bids_rfp_pg_unique').on(t.rfpId, t.pgWsId),
    unique('bids_rfp_pg_round_unique').on(t.rfpId, t.pgWsId, t.round),
```

- [ ] **Step 4: Bid 도메인 타입에 round 추가**

`lib/types/bid.ts` 의 `Bid` 타입에 추가(예: `status` 위/아래):
```typescript
  /** PG별 제출 순번. 1차=1, 재요청 응답=2…. */
  round: number;
```

- [ ] **Step 5: 리포 projection·매핑·save 에 round 반영**

`lib/server/repositories/drizzle/bid.ts`:
- `BID_COLUMNS` 에 추가: `round: bids.round,`
- `rowToBid` 가 만드는 객체에 `round: row.round,` 추가 (BidRow 타입에도 `round: number` 반영).
- `save()` 의 `.values({...})` 에 `round: bid.round,` 추가. `onConflictDoUpdate` 의 `set` 에도 `round: bid.round,` 추가(라운드별 새 id라 실제 충돌은 없지만 일관성 유지).

- [ ] **Step 6: GREEN 확인**

Run: `pnpm test --project unit-node lib/server/repositories/drizzle/__tests__/bid.test.ts`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add lib/db/schema/bids.ts lib/types/bid.ts lib/server/repositories/drizzle/bid.ts lib/server/repositories/drizzle/__tests__/bid.test.ts
git commit -m "feat(bids): round 컬럼 + UNIQUE(rfp,pg,round)로 라운드별 견적 허용"
```

---

### Task 2: 재요청 enum + 테이블 + 도메인 타입

**Files:**
- Modify: `lib/db/schema/_enums.ts`
- Create: `lib/db/schema/rfp-requote-requests.ts`
- Modify: `lib/db/schema/index.ts`
- Create: `lib/types/rfp-requote-request.ts`
- Test: `lib/db/__tests__/requote-schema.test.ts` (스키마 DDL 생성 smoke)

- [ ] **Step 1: 스키마 생성 실패 테스트 작성**

`lib/db/__tests__/requote-schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';

describe('rfp_requote_requests schema', () => {
  it('appears in generated DDL with the round-scoped unique index', async () => {
    const ddl = (await generateSchemaDDL()).join('\n');
    expect(ddl).toContain('rfp_requote_requests');
    expect(ddl).toContain('rfp_requote_request_status');
    expect(ddl).toContain('bids_rfp_pg_round_unique');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/db/__tests__/requote-schema.test.ts`
Expected: FAIL — `rfp_requote_requests`·`rfp_requote_request_status` 미존재.

- [ ] **Step 3: enum 추가**

`lib/db/schema/_enums.ts` 끝에:
```typescript
export const rfpRequoteRequestStatusEnum = pgEnum('rfp_requote_request_status', [
  'pending',
  'responded',
]);
```

- [ ] **Step 4: 테이블 파일 생성**

`lib/db/schema/rfp-requote-requests.ts`:
```typescript
import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfpRequoteRequestStatusEnum } from './_enums';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { users } from './users';

/**
 * 견적 재요청(마감 전 협상 라운드). 구매사가 특정 PG에게 "조건을 개선해 다시 내달라"고
 * 요청한 1건. (rfp, pg, round) UNIQUE — 라운드별 1요청, 중복 pending 차단.
 */
export const rfpRequoteRequests = pgTable(
  'rfp_requote_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    message: text('message').notNull(),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    status: rfpRequoteRequestStatusEnum('status').notNull().default('pending'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('rfp_requote_requests_rfp_ws_round_uniq').on(t.rfpId, t.pgWsId, t.round),
    index('rfp_requote_requests_pg_ws_status_idx').on(t.pgWsId, t.status),
  ],
);
```

- [ ] **Step 5: barrel export 추가**

`lib/db/schema/index.ts` 의 `rfp-pg-requests` export 다음 줄에:
```typescript
export * from './rfp-requote-requests';
```

- [ ] **Step 6: 도메인 타입 생성**

`lib/types/rfp-requote-request.ts`:
```typescript
export type RfpRequoteRequestStatus = 'pending' | 'responded';

export type RfpRequoteRequest = {
  id: string;
  rfpId: string;
  pgWsId: string;
  round: number;
  message: string;
  deadline: string; // ISO 8601
  status: RfpRequoteRequestStatus;
  createdByUserId: string;
  createdAt: string; // ISO 8601
  respondedAt?: string; // ISO 8601
};
```

- [ ] **Step 7: GREEN 확인**

Run: `pnpm test --project unit-node lib/db/__tests__/requote-schema.test.ts`
Expected: PASS.

- [ ] **Step 8: e2e raw SQL의 ON CONFLICT 교체**

```bash
grep -rn "ON CONFLICT (rfp_id, pg_ws_id)" e2e/
grep -rn "bids_rfp_pg_unique" .
```
나오는 raw SQL의 `ON CONFLICT (rfp_id, pg_ws_id)` 를 `ON CONFLICT (rfp_id, pg_ws_id, round)` 로 수정(insert 시 `round` 컬럼도 명시 — 기본 `1`). `bids_rfp_pg_unique` 문자열 참조가 남아있으면 새 이름으로 교체.

- [ ] **Step 9: 커밋**

```bash
git add lib/db/schema/_enums.ts lib/db/schema/rfp-requote-requests.ts lib/db/schema/index.ts lib/types/rfp-requote-request.ts lib/db/__tests__/requote-schema.test.ts e2e/
git commit -m "feat(schema): rfp_requote_requests 테이블 + 재요청 상태 enum"
```

---

### Task 3: `RfpRequoteRequestRepo` 인터페이스 + Drizzle 구현 + 팩토리 와이어링

**Files:**
- Modify: `lib/server/repositories/types.ts`
- Create: `lib/server/repositories/drizzle/rfp-requote-request.ts`
- Modify: `lib/server/repositories/factory.ts`
- Test: `lib/server/repositories/drizzle/__tests__/rfp-requote-request.test.ts`

- [ ] **Step 1: 리포 실패 테스트 작성**

`lib/server/repositories/drizzle/__tests__/rfp-requote-request.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { seedUser, seedBuyerWorkspace, seedPgWorkspace, seedRfp } from './_seed';
import { DrizzleRfpRequoteRequestRepository } from '../rfp-requote-request';
import type { RfpRequoteRequest } from '@/lib/types/rfp-requote-request';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

function makeReq(rfpId: string, pgWsId: string, userId: string, round = 2): RfpRequoteRequest {
  return {
    id: randomUUID(),
    rfpId,
    pgWsId,
    round,
    message: '카드 수수료를 조금 더 낮춰주세요',
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'pending',
    createdByUserId: userId,
    createdAt: new Date().toISOString(),
  };
}

describe('DrizzleRfpRequoteRequestRepository', () => {
  it('create → findPendingByPair returns it; markResponded clears pending', async () => {
    const repo = new DrizzleRfpRequoteRequestRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });

    const req = makeReq(rfpId, pgWs.id, buyer.id);
    await repo.create(req);

    const pending = await repo.findPendingByPair(rfpId, pgWs.id);
    expect(pending?.id).toBe(req.id);
    expect(pending?.round).toBe(2);

    await repo.markResponded(req.id, new Date());
    expect(await repo.findPendingByPair(rfpId, pgWs.id)).toBeUndefined();

    const all = await repo.findByRfp(rfpId);
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('responded');
  });

  it('duplicate (rfp,pg,round) throws', async () => {
    const repo = new DrizzleRfpRequoteRequestRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    await repo.create(makeReq(rfpId, pgWs.id, buyer.id, 2));
    await expect(repo.create(makeReq(rfpId, pgWs.id, buyer.id, 2))).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/server/repositories/drizzle/__tests__/rfp-requote-request.test.ts`
Expected: FAIL — `DrizzleRfpRequoteRequestRepository` 모듈 없음.

- [ ] **Step 3: 인터페이스 추가**

`lib/server/repositories/types.ts` 의 `PgRequestRepo` 인근에 추가하고, 파일 상단 타입 import에 `RfpRequoteRequest` 추가:
```typescript
import type { RfpRequoteRequest } from '@/lib/types/rfp-requote-request';

export interface RfpRequoteRequestRepo {
  /** 요청 1건 생성 — (rfp,pg,round) UNIQUE 위배 시 throw. */
  create(req: RfpRequoteRequest, tx?: Tx): Promise<void>;
  /** 한 RFP의 모든 재요청 — createdAt asc. */
  findByRfp(rfpId: string, tx?: Tx): Promise<RfpRequoteRequest[]>;
  /** (rfp, pg) 의 pending 요청 — 없으면 undefined. submit 라운드 게이트용. */
  findPendingByPair(rfpId: string, pgWsId: string, tx?: Tx): Promise<RfpRequoteRequest | undefined>;
  /** pending → responded 원자 전이(`WHERE status='pending'`). */
  markResponded(id: string, at: Date, tx?: Tx): Promise<void>;
}
```

- [ ] **Step 4: Drizzle 구현 작성**

`lib/server/repositories/drizzle/rfp-requote-request.ts`:
```typescript
import { and, asc, eq } from 'drizzle-orm';
import { rfpRequoteRequests } from '@/lib/db/schema';
import type { RfpRequoteRequest } from '@/lib/types/rfp-requote-request';
import type { RfpRequoteRequestRepo, Tx } from '../types';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type Row = typeof rfpRequoteRequests.$inferSelect;

function rowToReq(r: Row): RfpRequoteRequest {
  return {
    id: r.id,
    rfpId: r.rfpId,
    pgWsId: r.pgWsId,
    round: r.round,
    message: r.message,
    deadline: r.deadline.toISOString(),
    status: r.status,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : undefined,
  };
}

export class DrizzleRfpRequoteRequestRepository implements RfpRequoteRequestRepo {
  constructor(private readonly db: Db) {}
  private h(tx?: Tx): Db {
    return tx ?? this.db;
  }

  async create(req: RfpRequoteRequest, tx?: Tx): Promise<void> {
    await this.h(tx).insert(rfpRequoteRequests).values({
      id: req.id,
      rfpId: req.rfpId,
      pgWsId: req.pgWsId,
      round: req.round,
      message: req.message,
      deadline: new Date(req.deadline),
      status: req.status,
      createdByUserId: req.createdByUserId,
      createdAt: new Date(req.createdAt),
      respondedAt: req.respondedAt ? new Date(req.respondedAt) : null,
    });
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<RfpRequoteRequest[]> {
    const rows = (await this.h(tx)
      .select()
      .from(rfpRequoteRequests)
      .where(eq(rfpRequoteRequests.rfpId, rfpId))
      .orderBy(asc(rfpRequoteRequests.createdAt))) as Row[];
    return rows.map(rowToReq);
  }

  async findPendingByPair(
    rfpId: string,
    pgWsId: string,
    tx?: Tx,
  ): Promise<RfpRequoteRequest | undefined> {
    const [row] = (await this.h(tx)
      .select()
      .from(rfpRequoteRequests)
      .where(
        and(
          eq(rfpRequoteRequests.rfpId, rfpId),
          eq(rfpRequoteRequests.pgWsId, pgWsId),
          eq(rfpRequoteRequests.status, 'pending'),
        ),
      )
      .limit(1)) as Row[];
    return row ? rowToReq(row) : undefined;
  }

  async markResponded(id: string, at: Date, tx?: Tx): Promise<void> {
    await this.h(tx)
      .update(rfpRequoteRequests)
      .set({ status: 'responded', respondedAt: at })
      .where(and(eq(rfpRequoteRequests.id, id), eq(rfpRequoteRequests.status, 'pending')));
  }
}
```

- [ ] **Step 5: 팩토리 와이어링**

`lib/server/repositories/factory.ts`:
- import 블록에 타입 추가: `RfpRequoteRequestRepo`
- `RepoBundle` 타입에 추가: `rfpRequoteRequest: RfpRequoteRequestRepo;`
- `createRepoBundle()` 의 동적 import 묶음에 추가:
  ```typescript
  const { DrizzleRfpRequoteRequestRepository } = await import('./drizzle/rfp-requote-request');
  ```
- 반환 번들에 추가: `rfpRequoteRequest: new DrizzleRfpRequoteRequestRepository(db),`
- getter 추가:
  ```typescript
  export async function getRfpRequoteRequestRepo(): Promise<RfpRequoteRequestRepo> {
    return (await getBundle()).rfpRequoteRequest;
  }
  ```
- `BUNDLE_VERSION` 1 증가.

- [ ] **Step 6: GREEN 확인**

Run: `pnpm test --project unit-node lib/server/repositories/drizzle/__tests__/rfp-requote-request.test.ts`
Expected: PASS (두 케이스 모두).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/rfp-requote-request.ts lib/server/repositories/factory.ts lib/server/repositories/drizzle/__tests__/rfp-requote-request.test.ts
git commit -m "feat(repo): RfpRequoteRequestRepo (drizzle) + 팩토리 와이어링"
```

---

## Phase 2 — 알림·이메일 빌딩블록 (서비스가 의존하므로 먼저)

### Task 4: OutboxEvent + 이메일 템플릿

**Files:**
- Modify: `lib/server/outbox/types.ts`
- Modify: `lib/server/outbox/templates/types.ts`
- Create: `lib/server/outbox/templates/rfpRequoteRequested.tsx`
- Test: `lib/server/outbox/templates/__tests__/rfpRequoteRequested.test.ts`

- [ ] **Step 1: 템플릿 렌더 실패 테스트 작성**

`lib/server/outbox/templates/__tests__/rfpRequoteRequested.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { renderRfpRequoteRequested } from '../rfpRequoteRequested';

describe('renderRfpRequoteRequested', () => {
  it('renders buyer message, deadline, and inbox link', async () => {
    const html = await renderRfpRequoteRequested({
      rfpId: 'P-2606-0042',
      rfpTitle: '결제 인프라 견적',
      buyerName: '구매사ABC',
      message: '카드 수수료를 0.1%p 낮춰주세요',
      deadline: '2026-06-20 23:59',
      inboxUrl: 'https://partner.supporter-b.com/inbox/P-2606-0042',
    });
    expect(html).toContain('카드 수수료를 0.1%p 낮춰주세요');
    expect(html).toContain('P-2606-0042');
    expect(html).toContain('https://partner.supporter-b.com/inbox/P-2606-0042');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/server/outbox/templates/__tests__/rfpRequoteRequested.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: props 인터페이스 추가**

`lib/server/outbox/templates/types.ts` 끝에:
```typescript
export interface RfpRequoteRequestedProps {
  rfpId: string;
  rfpTitle: string;
  buyerName: string;
  /** 구매사 개선 요청 메시지(필수). */
  message: string;
  deadline: string;
  inboxUrl: string;
}
```

- [ ] **Step 4: OutboxEvent에 추가**

`lib/server/outbox/types.ts` 의 `OutboxEvent` union 에 추가:
```typescript
  | 'rfp.requote_requested'
```

- [ ] **Step 5: 템플릿 작성** (`rfpInvited.tsx` 패턴 차용)

`lib/server/outbox/templates/rfpRequoteRequested.tsx`:
```tsx
import * as React from 'react';
import { render } from '@react-email/render';
import { josa } from 'es-hangul';

import { Button, Layout, Mono } from './_layout';
import type { RfpRequoteRequestedProps } from './types';

export function RfpRequoteRequested({
  rfpId,
  rfpTitle,
  buyerName,
  message,
  deadline,
  inboxUrl,
}: RfpRequoteRequestedProps): React.JSX.Element {
  const buyerWithParticle = josa(buyerName, '이/가');
  const buyerParticle = buyerWithParticle.slice(buyerName.length);
  return (
    <Layout
      preheader={`${buyerWithParticle} ${rfpId} 견적을 다시 요청했어요.`}
      serial={`견적 재요청 / ${rfpId}`}
    >
      <h1 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 16px', letterSpacing: '-0.01em' }}>
        견적 재요청이 도착했어요
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        <strong>{buyerName}</strong>{buyerParticle} 조건을 개선해 다시 보내달라고 요청했어요.
      </p>

      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 20px', fontSize: '13px' }}>
        <tbody>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px', paddingBottom: '6px' }}>번호</td>
            <td style={{ paddingBottom: '6px' }}><Mono>{rfpId}</Mono></td>
          </tr>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px', paddingBottom: '6px' }}>제목</td>
            <td style={{ paddingBottom: '6px' }}>{rfpTitle}</td>
          </tr>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px' }}>새 마감</td>
            <td><Mono>{deadline}</Mono></td>
          </tr>
        </tbody>
      </table>

      <div style={{ margin: '0 0 24px', padding: '12px 14px', background: '#f6f6f6', borderRadius: '6px', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
        {message}
      </div>

      <Button href={inboxUrl}>견적 다시 보내기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{inboxUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderRfpRequoteRequested(
  props: RfpRequoteRequestedProps,
): Promise<string> {
  return render(<RfpRequoteRequested {...props} />);
}
```

- [ ] **Step 6: GREEN 확인**

Run: `pnpm test --project unit-node lib/server/outbox/templates/__tests__/rfpRequoteRequested.test.ts`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add lib/server/outbox/types.ts lib/server/outbox/templates/types.ts lib/server/outbox/templates/rfpRequoteRequested.tsx lib/server/outbox/templates/__tests__/rfpRequoteRequested.test.ts
git commit -m "feat(email): rfp.requote_requested outbox 이벤트 + 이메일 템플릿"
```

---

## Phase 3 — 서비스 레이어

### Task 5: `BidService.submit` 라운드 인지 분기

**Files:**
- Modify: `lib/server/services/bid.ts`
- Test: `lib/server/services/__tests__/bidSubmit.test.ts`

- [ ] **Step 1: 라운드 분기 실패 테스트 작성**

`bidSubmit.test.ts` 상단 import에 추가: `import { rfpRequoteRequests } from '@/lib/db/schema';`. `seedSubmitEnv` 를 재사용해 1차 제출 후 재요청 레코드를 심고 재제출하는 케이스 추가:

```typescript
async function submitFirst(s: Awaited<ReturnType<typeof seedSubmitEnv>>) {
  return service.submit({ ...BASE, rfpId: s.rfpId }, { userId: s.pgUser.id, workspaceId: s.pgWs.id });
}

it('blocks resubmission when no pending requote exists', async () => {
  const s = await seedSubmitEnv();
  expect((await submitFirst(s)).ok).toBe(true);
  const again = await submitFirst(s);
  expect(again.ok).toBe(false);
  if (!again.ok) expect(again.error).toBe('BID_ALREADY_SUBMITTED');
});

it('allows round-2 submit when a pending requote exists; marks it responded', async () => {
  const s = await seedSubmitEnv();
  expect((await submitFirst(s)).ok).toBe(true);

  await db.insert(rfpRequoteRequests).values({
    id: randomUUID(),
    rfpId: s.rfpId,
    pgWsId: s.pgWs.id,
    round: 2,
    message: '낮춰주세요',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'pending',
    createdByUserId: s.buyerUser.id,
    createdAt: new Date(),
  });

  const r2 = await service.submit({ ...BASE, rfpId: s.rfpId }, { userId: s.pgUser.id, workspaceId: s.pgWs.id });
  expect(r2.ok).toBe(true);

  const myBids = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
  expect(myBids.map((b) => b.round).sort()).toEqual([1, 2]);

  const reqs = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
  expect(reqs[0]!.status).toBe('responded');
});

it('rejects round-2 submit after the requote deadline passed', async () => {
  const s = await seedSubmitEnv();
  expect((await submitFirst(s)).ok).toBe(true);
  await db.insert(rfpRequoteRequests).values({
    id: randomUUID(),
    rfpId: s.rfpId,
    pgWsId: s.pgWs.id,
    round: 2,
    message: '낮춰주세요',
    deadline: new Date(Date.now() - 1000),
    status: 'pending',
    createdByUserId: s.buyerUser.id,
    createdAt: new Date(),
  });
  const r2 = await service.submit({ ...BASE, rfpId: s.rfpId }, { userId: s.pgUser.id, workspaceId: s.pgWs.id });
  expect(r2.ok).toBe(false);
  if (!r2.ok) expect(r2.error).toBe('REQUOTE_DEADLINE_PASSED');
});
```

`bidSubmit.test.ts` 의 서비스 생성부(`new BidService(...)`)에 신규 인자 `requoteRepo` 를 추가해야 컴파일된다(아래 Step 3에서 생성자 변경). 생성 코드에 `getRfpRequoteRequestRepo()` 결과를 마지막 인자로 추가.

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/server/services/__tests__/bidSubmit.test.ts`
Expected: FAIL — 재제출이 항상 `BID_ALREADY_SUBMITTED`(현행) 또는 생성자 인자 불일치 타입에러.

- [ ] **Step 3: BidService 생성자 + submit 라운드 분기 구현**

`lib/server/services/bid.ts`:
- 상단 import: `import type { RfpRequoteRequestRepo } from '@/lib/server/repositories/types';`
- 생성자 마지막에 인자 추가: `private readonly requoteRepo: RfpRequoteRequestRepo,`
- `submit()` 의 기존 "already submitted" 블록(아래)을 교체:
  ```typescript
  // 변경 전:
  // const existingBids = await this.bidRepo.findByRfp(input.rfpId);
  // if (existingBids.some((b) => b.pgWsId === actor.workspaceId)) {
  //   return { ok: false, error: 'BID_ALREADY_SUBMITTED' };
  // }
  ```
  교체 후:
  ```typescript
  const existingBids = await this.bidRepo.findByRfp(input.rfpId);
  const myBids = existingBids.filter((b) => b.pgWsId === actor.workspaceId);
  const maxRound = myBids.reduce((m, b) => Math.max(m, b.round), 0);

  let round = 1;
  let respondedRequoteId: string | null = null;
  if (maxRound >= 1) {
    // 이미 견적이 있다 — pending 재요청이 있어야만 새 라운드 제출 허용.
    const pending = await this.requoteRepo.findPendingByPair(input.rfpId, actor.workspaceId);
    if (!pending) return { ok: false, error: 'BID_ALREADY_SUBMITTED' };
    if (new Date(pending.deadline).getTime() < Date.now()) {
      return { ok: false, error: 'REQUOTE_DEADLINE_PASSED' };
    }
    round = maxRound + 1;
    respondedRequoteId = pending.id;
  }
  ```
- 그 아래에서 만들어 `bidRepo.save(...)` 에 넘기는 bid 객체에 `round,` 추가.
- 트랜잭션 안, `bidRepo.save` 직후(같은 tx)에 재요청 응답 마킹 추가:
  ```typescript
  if (respondedRequoteId) {
    await this.requoteRepo.markResponded(respondedRequoteId, now, tx);
  }
  ```

- [ ] **Step 4: getBidService 싱글턴에 repo 주입**

`lib/server/services/bid.ts` 의 `getBidService()` 에서 `getRfpRequoteRequestRepo` 를 factory import 묶음에 추가하고, `await` 로 받아 `new BidService(...)` 마지막 인자로 전달.

- [ ] **Step 5: 액션 테스트 셋업도 인자 추가**

`lib/server/actions/rfp/__tests__/_setup.ts` 의 `setupRfpActionEnv()`:
- repo 묶음에 `getRfpRequoteRequestRepo()` 추가.
- `new BidService(db, ..., bidNoteRepo)` 호출에 `requoteRepo` 를 마지막 인자로 추가.

- [ ] **Step 6: GREEN 확인**

Run: `pnpm test --project unit-node lib/server/services/__tests__/bidSubmit.test.ts`
Expected: PASS (신규 3 케이스 + 기존 케이스).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/services/bid.ts lib/server/services/__tests__/bidSubmit.test.ts lib/server/actions/rfp/__tests__/_setup.ts
git commit -m "feat(bid): submit 라운드 인지 분기 — pending 재요청 있을 때만 재제출 허용"
```

---

### Task 6: `RfpService.requote()`

**Files:**
- Modify: `lib/server/services/rfp.ts`
- Test: `lib/server/services/__tests__/requote.test.ts`

- [ ] **Step 1: requote 실패 테스트 작성**

`lib/server/services/__tests__/requote.test.ts` — `rfp.test.ts` 의 setup/`buildService`/`seedAwardEnv` 패턴을 그대로 재사용:
```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest, __useDrizzleWithDbForTest,
  getBidRepo, getBizProfileRepo, getContractRepo, getInvitationRepo,
  getOutboxRepo, getPgRequestRepo, getRfpRepo, getWorkspaceRepo,
  getRfpRequoteRequestRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile, seedBuyerWorkspace, seedMembership, seedPgWorkspace, seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { bids, notifications, outboxEntries, rfpInvitations, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { RfpService } from '../rfp';

let db: PgliteDB;
let service: RfpService;

async function buildService(): Promise<RfpService> {
  const [rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo, requoteRepo] =
    await Promise.all([
      getRfpRepo(), getContractRepo(), getOutboxRepo(), getWorkspaceRepo(), getBidRepo(),
      getInvitationRepo(), getPgRequestRepo(), getBizProfileRepo(), getRfpRequoteRequestRepo(),
    ]);
  return new RfpService(db, rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo, requoteRepo);
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});
afterEach(() => __resetForTest());

async function seedBidderEnv() {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'pg.io');
  const pgAdmin = await seedUser(db, { email: 'admin@pg.io' });
  await seedMembership(db, pgWs.id, pgAdmin.id, 'admin');

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId, code: 'P-2606-0007', buyerWsId: buyerWs.id, bizProfileId: biz.id,
    title: 'requote test', memo: '', deadline: new Date(Date.now() + 86_400_000),
    status: 'sent', createdBy: buyer.id, sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
    sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 7), status: 'accepted',
  });
  await db.insert(bids).values({
    id: randomUUID(), rfpId, pgWsId: pgWs.id, invitationId: invId, round: 1,
    settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0', paymentFees: {},
    status: 'submitted', submittedBy: pgAdmin.id, submittedAt: new Date(),
  });
  return { buyer, buyerWs, pgWs, pgAdmin, rfpId };
}

const future = () => new Date(Date.now() + 3 * 86_400_000);

describe('RfpService.requote', () => {
  it('creates a pending requote(round 2), updates rfp.deadline, notifies PG admin', async () => {
    const s = await seedBidderEnv();
    const r = await service.requote(
      s.rfpId,
      { targetPgWsIds: [s.pgWs.id], message: '카드 수수료를 낮춰주세요', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(true);

    const reqs = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.round).toBe(2);
    expect(reqs[0]!.status).toBe('pending');

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(rfpRow!.deadline.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);

    const notifs = await db.select().from(notifications).where(eq(notifications.userId, s.pgAdmin.id));
    expect(notifs.some((n) => n.type === 'rfp.requote_requested')).toBe(true);

    const emails = await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'rfp.requote_requested'));
    expect(emails.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a target PG with no submitted bid', async () => {
    const s = await seedBidderEnv();
    const otherPg = await seedPgWorkspace(db, 'no-bid.io');
    const r = await service.requote(
      s.rfpId,
      { targetPgWsIds: [otherPg.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TARGET_NOT_BIDDER');
  });

  it('rejects when rfp is not sent', async () => {
    const s = await seedBidderEnv();
    await db.update(rfps).set({ status: 'awarded' }).where(eq(rfps.id, s.rfpId));
    const r = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('RFP_NOT_OPEN');
  });

  it('rejects a past deadline and an empty target list', async () => {
    const s = await seedBidderEnv();
    const past = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: new Date(Date.now() - 1000) },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(past.ok).toBe(false);
    const empty = await service.requote(
      s.rfpId, { targetPgWsIds: [], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(empty.ok).toBe(false);
  });

  it('rejects a duplicate pending requote for the same pair', async () => {
    const s = await seedBidderEnv();
    const ok = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(ok.ok).toBe(true);
    const dup = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe('REQUOTE_ALREADY_PENDING');
  });

  it('forbids a non-owner buyer', async () => {
    const s = await seedBidderEnv();
    const r = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: randomUUID() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_BUYER');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/server/services/__tests__/requote.test.ts`
Expected: FAIL — `service.requote` 미구현 + 생성자 인자 불일치.

- [ ] **Step 3: RfpService 생성자 + requote 구현**

`lib/server/services/rfp.ts`:
- import: `import type { RfpRequoteRequestRepo } from '@/lib/server/repositories/types';`, `import { renderRfpRequoteRequested } from '@/lib/server/outbox/templates/rfpRequoteRequested';`, `import { baseUrlFor } from '@/lib/server/env';`(이미 있으면 생략), `import { formatDate } from '@/lib/format';`(마감 표기용; 없으면 ISO slice 사용).
- 생성자 마지막에 추가: `private readonly requoteRepo: RfpRequoteRequestRepo,`
- 메서드 추가(`award` 패턴 차용):
  ```typescript
  async requote(
    rfpId: string,
    input: { targetPgWsIds: string[]; message: string; newDeadline: Date },
    actor: Actor,
  ): Promise<ServiceResult> {
    if (input.targetPgWsIds.length === 0) {
      return { ok: false, error: 'NO_TARGETS' };
    }
    if (input.message.trim().length === 0) {
      return { ok: false, error: 'MESSAGE_REQUIRED' };
    }
    if (input.newDeadline.getTime() <= Date.now()) {
      return { ok: false, error: 'DEADLINE_IN_PAST' };
    }

    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const rfp = await this.rfpRepo.findById(rfpId, tx);
      if (!rfp) return { ok: false as const, error: 'RFP_NOT_FOUND' };
      if (rfp.buyerWsId !== actor.workspaceId) return { ok: false as const, error: 'FORBIDDEN_BUYER' };
      if (rfp.status !== 'sent') return { ok: false as const, error: 'RFP_NOT_OPEN' };

      const allBids = await this.bidRepo.findByRfp(rfpId, tx);
      const now = new Date();

      // 1) 전 대상 검증 — 하나라도 실패하면 all-or-nothing 롤백.
      const plans: { pgWsId: string; round: number }[] = [];
      for (const pgWsId of input.targetPgWsIds) {
        const theirSubmitted = allBids.filter((b) => b.pgWsId === pgWsId && b.status === 'submitted');
        if (theirSubmitted.length === 0) {
          return { ok: false as const, error: 'TARGET_NOT_BIDDER' };
        }
        const existingPending = await this.requoteRepo.findPendingByPair(rfpId, pgWsId, tx);
        if (existingPending) return { ok: false as const, error: 'REQUOTE_ALREADY_PENDING' };
        const maxRound = theirSubmitted.reduce((m, b) => Math.max(m, b.round), 0);
        plans.push({ pgWsId, round: maxRound + 1 });
      }

      // 2) 레코드 생성 + 마감 갱신.
      for (const p of plans) {
        await this.requoteRepo.create(
          {
            id: randomUUID(),
            rfpId,
            pgWsId: p.pgWsId,
            round: p.round,
            message: input.message,
            deadline: input.newDeadline.toISOString(),
            status: 'pending',
            createdByUserId: actor.userId,
            createdAt: now.toISOString(),
          },
          tx,
        );
      }
      await this.rfpRepo.update(rfpId, { deadline: input.newDeadline }, tx);

      // 3) 알림 + 이메일 팬아웃 (대상 PG admin 멤버).
      const deadlineLabel = input.newDeadline.toISOString().replace('T', ' ').slice(0, 16);
      const inboxUrl = `${baseUrlFor('pg')}/inbox/${rfp.code}`;
      const buyerName = (await this.workspaceRepo.findById(rfp.buyerWsId, tx))?.name ?? '구매사';
      const html = await renderRfpRequoteRequested({
        rfpId: rfp.code,
        rfpTitle: rfp.title,
        buyerName,
        message: input.message,
        deadline: deadlineLabel,
        inboxUrl,
      });

      for (const p of plans) {
        const members = await this.workspaceRepo.adminMembers(p.pgWsId, tx); // {userId,email}[]
        for (const m of members) {
          const notif: Notification = {
            id: randomUUID(),
            userId: m.userId,
            workspaceId: p.pgWsId,
            type: 'rfp.requote_requested',
            title: `[${rfp.code}] 견적 재요청이 도착했어요`,
            body: `${buyerName}가 조건 개선을 요청했어요.`,
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfp.code}`,
            createdAt: now.toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
          await this.outboxRepo.enqueue(
            {
              event: 'rfp.requote_requested',
              to: m.email,
              subject: `[Supporter B · ${rfp.code}] 견적 재요청이 도착했어요`,
              html,
              dedupeKey: `rfp:${rfpId}:requote:ws:${p.pgWsId}:round:${p.round}:user:${m.userId}`,
            },
            tx,
          );
        }
      }

      return { ok: true as const };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }
  ```
  **주의 — 의존 메서드 확인:** 위 코드는 `this.rfpRepo.update(id, {deadline}, tx)` 와 `this.workspaceRepo.adminMembers(pgWsId, tx)` 를 사용한다. 실제 인터페이스 이름을 먼저 확인:
  ```bash
  grep -n "deadline" lib/server/repositories/types.ts
  grep -nE "adminMembers|memberEmails|admin" lib/server/repositories/types.ts
  ```
  - RfpRepo에 deadline만 바꾸는 update가 없으면, 가장 가까운 메서드(예: `transition`은 status 전용이라 부적합) 대신 `update`/`setDeadline`를 추가하거나 `tx.update(rfps).set({deadline}).where(eq(rfps.id, rfpId))` 를 직접 사용한다(award가 contracts에 직접 tx를 쓰는 전례 있음).
  - admin 멤버 조회는 award가 쓰는 `workspaceRepo.memberEmails(wsId, tx)` 가 email만 주면, userId가 필요하므로 submit이 쓰는 `tx.select({userId, email}).from(workspaceMembers).innerJoin(users…).where(workspaceId = pgWsId AND role='admin')` 패턴을 그대로 차용한다(이미 bid.ts submit에 동일 쿼리 존재 — 거기서 복사, role='admin' 필터만 추가).

- [ ] **Step 4: getRfpService 싱글턴에 repo 주입**

`lib/server/services/rfp.ts` 의 `getRfpService()` 의 factory import 묶음에 `getRfpRequoteRequestRepo` 추가하고, `await` 받아 `new RfpService(...)` 마지막 인자로 전달.

- [ ] **Step 5: rfp.test.ts buildService 인자 추가 + 액션 셋업 동기화**

- `lib/server/services/__tests__/rfp.test.ts` 의 `buildService()` 에 `getRfpRequoteRequestRepo()` 추가 + `new RfpService(...)` 마지막 인자.
- `lib/server/actions/rfp/__tests__/_setup.ts` 의 `setupRfpActionEnv()` 의 `new RfpService(...)` 에도 마지막 인자 추가(Task 5 Step 5에서 repo는 이미 묶음에 추가됨).

- [ ] **Step 6: GREEN 확인**

Run: `pnpm test --project unit-node lib/server/services/__tests__/requote.test.ts lib/server/services/__tests__/rfp.test.ts`
Expected: PASS (requote 6 케이스 + 기존 rfp 케이스 회귀 없음).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/services/rfp.ts lib/server/services/__tests__/requote.test.ts lib/server/services/__tests__/rfp.test.ts lib/server/actions/rfp/__tests__/_setup.ts
git commit -m "feat(rfp): RfpService.requote — 타깃 PG 재요청 생성·마감 갱신·알림/이메일 팬아웃"
```

---

## Phase 4 — 액션

### Task 7: `requestRequoteAction`

**Files:**
- Create: `lib/server/actions/rfp/requestRequoteAction.ts`
- Modify: `lib/server/actions/rfp/index.ts`
- Test: `lib/server/actions/rfp/__tests__/requestRequote.test.ts`

- [ ] **Step 1: 액션 실패 테스트 작성**

`lib/server/actions/rfp/__tests__/requestRequote.test.ts` — 기존 액션 테스트(예: getOrCreateConversation.test) 의 세션 목 + `setupRfpActionEnv` 패턴 차용:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const sessionRef: { value: { user: { id: string; email: string; workspaceId: string; workspaceType: 'buyer' | 'pg' } } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireBuyerSession: () =>
    sessionRef.value && sessionRef.value.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN')),
}));

import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import {
  seedUser, seedBuyerWorkspace, seedMembership, seedPgWorkspace,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { bids, rfpInvitations, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { requestRequoteAction } from '../requestRequoteAction';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;

async function seedBidder() {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'pg.io');
  const pgAdmin = await seedUser(db, { email: 'a@pg.io' });
  await seedMembership(db, pgWs.id, pgAdmin.id, 'admin');
  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId, code: 'P-2606-0011', buyerWsId: buyerWs.id, title: 't',
    deadline: new Date(Date.now() + 86_400_000), status: 'sent', createdBy: buyer.id, sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
    sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 7), status: 'accepted',
  });
  await db.insert(bids).values({
    id: randomUUID(), rfpId, pgWsId: pgWs.id, invitationId: invId, round: 1,
    settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0', paymentFees: {},
    status: 'submitted', submittedBy: pgAdmin.id, submittedAt: new Date(),
  });
  return { buyer, buyerWs, pgWs, rfpId };
}

beforeEach(async () => { db = await setupRfpActionEnv(); });
afterEach(() => { teardownRfpActionEnv(); sessionRef.value = null; });

describe('requestRequoteAction', () => {
  it('creates a requote when called by the owning buyer', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    const r = await requestRequoteAction({
      rfpId: s.rfpId,
      pgWsIds: [s.pgWs.id],
      message: '카드 수수료를 낮춰주세요',
      newDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    expect(r.ok).toBe(true);
    const reqs = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(reqs).toHaveLength(1);
  });

  it('rejects empty message via zod', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    const r = await requestRequoteAction({ rfpId: s.rfpId, pgWsIds: [s.pgWs.id], message: '   ', newDeadline: new Date(Date.now() + 86_400_000).toISOString() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects an unauthenticated/non-buyer caller', async () => {
    const s = await seedBidder();
    sessionRef.value = null;
    const r = await requestRequoteAction({ rfpId: s.rfpId, pgWsIds: [s.pgWs.id], message: 'x', newDeadline: new Date(Date.now() + 86_400_000).toISOString() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_BUYER');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/server/actions/rfp/__tests__/requestRequote.test.ts`
Expected: FAIL — `requestRequoteAction` 모듈 없음.

- [ ] **Step 3: 액션 구현**

`lib/server/actions/rfp/requestRequoteAction.ts`:
```typescript
'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().uuid(),
    pgWsIds: z.array(z.string().uuid()).min(1),
    message: z.string().trim().min(1).max(2000),
    newDeadline: z.string().datetime(),
  })
  .strict();

export type RequestRequoteInput = z.input<typeof Input>;
export type RequestRequoteResult = RfpActionResult;

/**
 * 견적 재요청. 세션/입력 파싱 후 RfpService.requote 위임.
 * rfpId 는 uuid(상세 화면의 rfp.id)를 그대로 받는다 — awardRfpAction 과 동일.
 */
export async function requestRequoteAction(
  input: RequestRequoteInput,
): Promise<RequestRequoteResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.requote(
    parsed.data.rfpId,
    {
      targetPgWsIds: parsed.data.pgWsIds,
      message: parsed.data.message,
      newDeadline: new Date(parsed.data.newDeadline),
    },
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
```

- [ ] **Step 4: index re-export**

`lib/server/actions/rfp/index.ts` 에 추가:
```typescript
export { requestRequoteAction } from './requestRequoteAction';
export type { RequestRequoteInput, RequestRequoteResult } from './requestRequoteAction';
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test --project unit-node lib/server/actions/rfp/__tests__/requestRequote.test.ts`
Expected: PASS (3 케이스).

- [ ] **Step 6: 커밋**

```bash
git add lib/server/actions/rfp/requestRequoteAction.ts lib/server/actions/rfp/index.ts lib/server/actions/rfp/__tests__/requestRequote.test.ts
git commit -m "feat(action): requestRequoteAction — buyer 세션·zod 검증 후 requote 위임"
```

---

## Phase 5 — 로더 (current-bid 선택 + 재요청 정보 노출)

### Task 8: `rfp-detail-loader` — buyer·PG 라운드/재요청 데이터

**Files:**
- Modify: `lib/server/rfp-detail-loader.ts`
- Test: `lib/server/__tests__/rfp-detail-loader.test.ts` (있으면 추가; 없으면 신규)

- [ ] **Step 1: 로더 실패 테스트 작성**

기존 로더 테스트 존재 여부 확인(`ls lib/server/__tests__ | grep detail`). 없으면 신규 파일. 핵심 두 가지를 검증: (a) buyer 로더의 `bids` 가 PG별 최신 라운드만, (b) `requoteByPg` 가 pending 재요청을 노출. 통합 테스트는 PGlite + 직접 insert + 팩토리 사용:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { seedUser, seedBuyerWorkspace, seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { bids, rfpInvitations, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { loadBuyerRfpDetail } from '../rfp-detail-loader';

let db: PgliteDB;
beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

it('buyer loader returns only the latest-round bid per PG and exposes requoteByPg', async () => {
  const buyer = await seedUser(db);
  const buyerWs = await seedBuyerWorkspace(db);
  const pgWs = await seedPgWorkspace(db, 'pg.io');
  const rfpId = randomUUID();
  const code = 'P-2606-0021';
  await db.insert(rfps).values({
    id: rfpId, code, buyerWsId: buyerWs.id, title: 't',
    deadline: new Date(Date.now() + 86_400_000), status: 'sent', createdBy: buyer.id, sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
    sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 7), status: 'accepted',
  });
  const common = { rfpId, pgWsId: pgWs.id, invitationId: invId, settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0', paymentFees: {}, status: 'submitted' as const, submittedBy: buyer.id, submittedAt: new Date() };
  await db.insert(bids).values({ id: randomUUID(), round: 1, ...common });
  await db.insert(bids).values({ id: randomUUID(), round: 2, ...common });
  await db.insert(rfpRequoteRequests).values({
    id: randomUUID(), rfpId, pgWsId: pgWs.id, round: 2, message: 'x',
    deadline: new Date(Date.now() + 86_400_000), status: 'responded', createdByUserId: buyer.id, createdAt: new Date(), respondedAt: new Date(),
  });

  const data = await loadBuyerRfpDetail({ code, workspaceId: buyerWs.id, userId: buyer.id, userName: 'B' });
  expect(data).not.toBeNull();
  const forPg = data!.bids.filter((b) => b.pgWsId === pgWs.id);
  expect(forPg).toHaveLength(1);
  expect(forPg[0]!.round).toBe(2);
  expect(data!.requoteByPg[pgWs.id]?.status).toBe('responded');
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test --project unit-node lib/server/__tests__/rfp-detail-loader.test.ts`
Expected: FAIL — `bids` 에 round 1·2 둘 다 들어가 길이 2, `requoteByPg` 미존재.

- [ ] **Step 3: buyer 로더 구현**

`lib/server/rfp-detail-loader.ts`:
- 상단: `import { getRfpRequoteRequestRepo } from '@/lib/server/repositories/factory';`, `import type { RfpRequoteRequestStatus } from '@/lib/types/rfp-requote-request';`
- 파일 내 헬퍼 추가:
  ```typescript
  /** PG별 최신 라운드(submitted)만 남긴다. */
  function pickCurrentBids(submitted: Bid[]): Bid[] {
    const byPg = new Map<string, Bid>();
    for (const b of submitted) {
      const cur = byPg.get(b.pgWsId);
      if (!cur || b.round > cur.round) byPg.set(b.pgWsId, b);
    }
    return [...byPg.values()];
  }
  ```
- `BuyerRfpDetailData` 타입에 추가:
  ```typescript
  /** pgWsId → 최신 재요청 요약(없으면 키 없음). */
  requoteByPg: Record<string, { status: RfpRequoteRequestStatus; round: number; deadline: string }>;
  /** pgWsId → 직전 라운드 견적(델타 표시용; 없으면 키 없음). */
  priorBidByPg: Record<string, Bid>;
  ```
- 함수 본문: 기존 `const bids = allBids.filter((b) => b.status === 'submitted');` 를:
  ```typescript
  const submitted = allBids.filter((b) => b.status === 'submitted');
  const bids = pickCurrentBids(submitted);

  // 직전 라운드(현재 라운드 바로 아래 최댓값) — 델타 표시용.
  const priorBidByPg: Record<string, Bid> = {};
  for (const cur of bids) {
    const prior = submitted
      .filter((b) => b.pgWsId === cur.pgWsId && b.round < cur.round)
      .sort((a, b) => b.round - a.round)[0];
    if (prior) priorBidByPg[cur.pgWsId] = prior;
  }

  // 재요청 요약 — pgWsId별 라운드 최댓값 1건.
  const requoteRows = await (await getRfpRequoteRequestRepo()).findByRfp(rfp.id);
  const requoteByPg: Record<string, { status: RfpRequoteRequestStatus; round: number; deadline: string }> = {};
  for (const r of requoteRows) {
    const cur = requoteByPg[r.pgWsId];
    if (!cur || r.round > cur.round) {
      requoteByPg[r.pgWsId] = { status: r.status, round: r.round, deadline: r.deadline };
    }
  }
  ```
  주의: `notesByBid` 루프는 `bids`(현재 라운드)만 도므로 그대로 둔다. 반환 객체에 `requoteByPg, priorBidByPg,` 추가.

- [ ] **Step 4: PG 로더 구현 — pendingRequote 노출**

같은 파일의 `loadPgRfpDetail`(또는 PG 로더)와 `PgRfpDetailData` 타입을 수정:
- 타입에 추가:
  ```typescript
  /** 진행 중인 재요청(있으면 PG가 다시 제출 가능). */
  pendingRequote: { message: string; deadline: string; round: number } | null;
  ```
- 본문: `myBid` 계산을 "최신 라운드 submitted" 로 바꾸고(여러 라운드 가능), pending 재요청 조회:
  ```typescript
  const submittedMine = allMine.filter((b) => b.status === 'submitted');
  const myBid = submittedMine.sort((a, b) => b.round - a.round)[0] ?? undefined;
  const pending = await (await getRfpRequoteRequestRepo()).findPendingByPair(rfp.id, args.workspaceId);
  const pendingRequote = pending
    ? { message: pending.message, deadline: pending.deadline, round: pending.round }
    : null;
  ```
  (PG 로더가 bids를 어떻게 얻는지 확인 후 `allMine` 변수명에 맞춰 조정. 없으면 `(await getBidRepo()).findByRfp(rfp.id)` 에서 `b.pgWsId === args.workspaceId` 필터.)
- 반환에 `pendingRequote,` 추가.

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test --project unit-node lib/server/__tests__/rfp-detail-loader.test.ts`
Expected: PASS.

- [ ] **Step 6: 전체 노드 스위트 회귀 확인** (로더는 광범위하게 쓰임)

Run: `pnpm test --project unit-node lib/server`
Expected: PASS (기존 로더 소비 테스트 회귀 없음). 실패 시 `bids` 길이를 가정한 기존 테스트가 있는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add lib/server/rfp-detail-loader.ts lib/server/__tests__/rfp-detail-loader.test.ts
git commit -m "feat(loader): PG별 최신 라운드 견적 선택 + buyer/PG 재요청 정보 노출"
```

---

## Phase 6 — UI

### Task 9: `RequoteDialog` (구매사)

**Files:**
- Create: `components/rfp/comparison/RequoteDialog.tsx`
- Test: `components/rfp/comparison/__tests__/RequoteDialog.test.tsx`

- [ ] **Step 1: 다이얼로그 실패 테스트 작성**

`components/rfp/comparison/__tests__/RequoteDialog.test.tsx` — `confirm-dialog.test.tsx` 의 폴리필 패턴 차용 + 액션 목:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const requestRequoteAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  requestRequoteAction: (input: unknown) => requestRequoteAction(input),
}));

import { RequoteDialog } from '../RequoteDialog';

const CANDIDATES = [
  { pgWsId: 'pg-1', name: 'OO페이' },
  { pgWsId: 'pg-2', name: '△△페이' },
];

afterEach(() => cleanup());
beforeEach(() => requestRequoteAction.mockReset());

describe('RequoteDialog', () => {
  it('blocks submit with empty message', async () => {
    const user = userEvent.setup();
    render(<RequoteDialog open onOpenChange={vi.fn()} rfpId="11111111-1111-1111-1111-111111111111" candidates={CANDIDATES} />);
    await user.click(screen.getByLabelText('OO페이'));
    await user.click(screen.getByRole('button', { name: '재요청 보내기' }));
    expect(requestRequoteAction).not.toHaveBeenCalled();
    expect(screen.getByText(/개선 요청/)).toBeInTheDocument();
  });

  it('submits selected PGs + message + deadline', async () => {
    const user = userEvent.setup();
    requestRequoteAction.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(<RequoteDialog open onOpenChange={onOpenChange} rfpId="11111111-1111-1111-1111-111111111111" candidates={CANDIDATES} />);
    await user.click(screen.getByLabelText('OO페이'));
    await user.type(screen.getByPlaceholderText(/개선/), '카드 수수료를 낮춰주세요');
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await user.clear(screen.getByLabelText('새 마감일'));
    await user.type(screen.getByLabelText('새 마감일'), future);
    await user.click(screen.getByRole('button', { name: '재요청 보내기' }));
    await waitFor(() => expect(requestRequoteAction).toHaveBeenCalledTimes(1));
    const arg = requestRequoteAction.mock.calls[0]![0] as { pgWsIds: string[]; message: string };
    expect(arg.pgWsIds).toEqual(['pg-1']);
    expect(arg.message).toBe('카드 수수료를 낮춰주세요');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/rfp/comparison/__tests__/RequoteDialog.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 컴포넌트 구현** (`AwardConfirmDialog` 패턴 차용)

`components/rfp/comparison/RequoteDialog.tsx`:
```tsx
'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { requestRequoteAction } from '@/lib/server/actions/rfp';
import { cn } from '@/lib/utils';

type Candidate = { pgWsId: string; name: string };

export function RequoteDialog({
  open,
  onOpenChange,
  rfpId,
  candidates,
  onRequested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** uuid — requestRequoteAction 용 */
  rfpId: string;
  /** 현재 견적을 낸 PG들(재요청 대상 후보). */
  candidates: Candidate[];
  onRequested?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const messageInvalid = message.trim().length === 0;

  const handleSubmit = async () => {
    if (submitting) return;
    if (selected.size === 0) { setError('재요청할 PG를 한 곳 이상 선택해 주세요'); return; }
    if (messageInvalid) { setError('개선 요청 메시지를 입력해 주세요'); return; }
    if (!deadline) { setError('새 마감일을 선택해 주세요'); return; }
    setSubmitting(true);
    setError('');
    const r = await requestRequoteAction({
      rfpId,
      pgWsIds: [...selected],
      message: message.trim(),
      newDeadline: `${deadline}T23:59:59Z`,
    });
    setSubmitting(false);
    if (!r.ok) { setError(r.error); return; }
    onRequested?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>견적을 다시 요청할까요?</DialogTitle>
          <DialogDescription>
            선택한 PG에게 개선 요청과 새 마감일을 보내요. 받은 PG는 조건을 고쳐 다시 보낼 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <Label size="md">재요청할 PG</Label>
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <label key={c.pgWsId} className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={c.name}
                  checked={selected.has(c.pgWsId)}
                  onChange={() => toggle(c.pgWsId)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1">
          <Label size="md">개선 요청 메시지 *</Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="예: 카드 수수료를 0.1%p만 더 낮춰주실 수 있을까요?"
            rows={3}
            className="w-full rounded-[6px] border border-[var(--md-sys-color-outline)] bg-transparent p-2 text-[13px] focus:outline-none focus:border-[var(--md-sys-color-on-surface)]"
          />
        </div>

        <div className="space-y-1">
          <Label size="md">새 마감일 *</Label>
          <input
            type="date"
            aria-label="새 마감일"
            value={deadline}
            min={tomorrow}
            onChange={(e) => setDeadline(e.target.value)}
            className="block bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] font-mono tabular-nums focus:outline-none focus:border-[var(--md-sys-color-on-surface)]"
          />
        </div>

        {error && (
          <p role="alert" className={cn('font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]')}>
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outlined" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'LOADING…' : '재요청 보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/rfp/comparison/__tests__/RequoteDialog.test.tsx`
Expected: PASS (2 케이스).

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/comparison/RequoteDialog.tsx components/rfp/comparison/__tests__/RequoteDialog.test.tsx
git commit -m "feat(ui): RequoteDialog — PG 다중선택 + 필수 메시지 + 새 마감일"
```

---

### Task 10: 구매사 비교 화면에 재요청 CTA + 라운드/상태 칩 연결

**Files:**
- Modify: `components/rfp/RfpDetailContent.tsx`
- Modify: `components/rfp/comparison/FocusComparison.tsx`
- Test: `components/rfp/comparison/__tests__/FocusComparison.test.tsx` (있으면 추가; 없으면 신규)

- [ ] **Step 1: 칩/CTA 노출 실패 테스트 작성**

`FocusComparison` 에 `requoteByPg`·`candidates`(또는 동등 prop)를 넘겼을 때, 재요청 보낸 PG 탭에 `재요청함 · 응답대기`/`재제출됨` 칩이, RFP가 `sent` 면 `견적 재요청` 버튼이 보이는지 검증. 기존 테스트 파일이 있으면 케이스 추가, 없으면 폴리필 포함 신규:
```tsx
// 폴리필(ResizeObserver/scrollIntoView)은 RequoteDialog 테스트와 동일하게 상단에 둔다.
it('shows requote status chip and a 견적 재요청 button while sent', () => {
  render(
    <FocusComparison
      bids={[{ /* 최소 Bid 객체: id, pgWsId:'pg-1', round:2, status:'submitted', settleCycle, settleLimit, guaranteeInsurance, paymentFees:{}, customFees:{}, proposalPdfs:[], submittedBy, ... */ } as never]}
      pgWsNameMap={{ 'pg-1': 'OO페이' }}
      current={{ feeRate: null, settlementCycle: null, settlementLimit: null, guaranteeInsurance: null }}
      notesByBid={{}}
      rfpStatus="sent"
      awardedBidId={null}
      requiredPaymentMethods={[]}
      customPaymentMethods={[]}
      rfpId="11111111-1111-1111-1111-111111111111"
      rfpCode="P-2606-0021"
      requoteByPg={{ 'pg-1': { status: 'pending', round: 2, deadline: new Date().toISOString() } }}
    />,
  );
  expect(screen.getByText(/재요청함/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /견적 재요청/ })).toBeInTheDocument();
});
```
(주: Bid 최소 객체는 `lib/types/bid.ts` 필드에 맞춰 채운다. 테스트가 무겁다면 이 케이스는 "칩 텍스트 렌더" 만 최소 검증.)

- [ ] **Step 2: RED 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/rfp/comparison/__tests__/FocusComparison.test.tsx`
Expected: FAIL — `requoteByPg` prop 미수용 / 칩·버튼 없음.

- [ ] **Step 3: FocusComparison 구현**

`components/rfp/comparison/FocusComparison.tsx`:
- props에 추가: `requoteByPg?: Record<string, { status: 'pending' | 'responded'; round: number; deadline: string }>;`
- 상단 import: `import { RequoteDialog } from './RequoteDialog';`, `useState` 이미 사용 중.
- 상태: `const [requoteOpen, setRequoteOpen] = useState(false);`
- 탭 라벨 옆(기존 `isAwarded` 칩 자리 인근)에 재요청 상태 칩:
  ```tsx
  {requoteByPg?.[bid.pgWsId] && (
    <Chip
      label={requoteByPg[bid.pgWsId]!.status === 'pending' ? '재요청함 · 응답대기' : '재제출됨'}
      color={requoteByPg[bid.pgWsId]!.status === 'pending' ? 'warning' : 'tertiary'}
    />
  )}
  {bid.round > 1 && <Chip label={`${bid.round}차`} color="surface" />}
  ```
- 선정 CTA 영역(`canAward` 블록) 옆에, RFP가 `sent` 일 때 재요청 버튼 추가:
  ```tsx
  {rfpStatus === 'sent' && (
    <Button variant="outlined" onClick={() => setRequoteOpen(true)}>견적 재요청</Button>
  )}
  ```
- 컴포넌트 끝(AwardConfirmDialog 인근)에 다이얼로그 렌더:
  ```tsx
  <RequoteDialog
    open={requoteOpen}
    onOpenChange={setRequoteOpen}
    rfpId={props.rfpId}
    candidates={sortedBids.map((b) => ({ pgWsId: b.pgWsId, name: pgName(b.pgWsId) }))}
    onRequested={() => { /* RSC revalidate: router.refresh() */ }}
  />
  ```
  `onRequested` 에서 새로고침이 필요하면 `useRouter().refresh()` 사용(상단 `import { useRouter } from 'next/navigation';`). RequoteDialog 의 candidates 는 **현재 라운드 견적을 낸 PG** 들이라 sortedBids 그대로면 충분.

- [ ] **Step 4: RfpDetailContent 에서 loader 신규 필드 전달**

`components/rfp/RfpDetailContent.tsx`:
- 구조분해에 `requoteByPg` 추가.
- `<FocusComparison ... />` 에 `requoteByPg={requoteByPg}` 추가.

- [ ] **Step 5: GREEN 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/rfp/comparison/__tests__/FocusComparison.test.tsx`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add components/rfp/RfpDetailContent.tsx components/rfp/comparison/FocusComparison.tsx components/rfp/comparison/__tests__/FocusComparison.test.tsx
git commit -m "feat(ui): 비교 화면 견적 재요청 CTA + 라운드/응답 상태 칩"
```

---

### Task 11: PG 재요청 배너 + prefill 재제출 흐름

**Files:**
- Create: `components/inbox/RequoteBanner.tsx`
- Modify: `components/inbox/PgRfpDetailContent.tsx`
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Test: `components/inbox/__tests__/RequoteBanner.test.tsx`

- [ ] **Step 1: 배너 실패 테스트 작성**

`components/inbox/__tests__/RequoteBanner.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RequoteBanner } from '../RequoteBanner';

afterEach(() => cleanup());

describe('RequoteBanner', () => {
  it('renders buyer message and new deadline', () => {
    render(<RequoteBanner message="카드 수수료를 낮춰주세요" deadline="2026-06-20T23:59:59Z" />);
    expect(screen.getByText('카드 수수료를 낮춰주세요')).toBeInTheDocument();
    expect(screen.getByText(/재요청/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/inbox/__tests__/RequoteBanner.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 배너 구현**

`components/inbox/RequoteBanner.tsx`:
```tsx
import { LocalTime } from '@/components/primitives/LocalTime';

export function RequoteBanner({ message, deadline }: { message: string; deadline: string }) {
  return (
    <div className="mb-6 rounded-[8px] border border-[var(--md-sys-color-warning-container)] bg-[var(--md-sys-color-warning-container)] p-4">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-warning-container)]">
        견적 재요청을 받았어요
      </p>
      <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--md-sys-color-on-warning-container)]">{message}</p>
      <p className="mt-2 font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-warning-container)]">
        새 마감 <LocalTime iso={deadline} />
      </p>
    </div>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/inbox/__tests__/RequoteBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: BidWizard 에 initialBid prefill prop 추가**

`components/inbox/bid-wizard/BidWizard.tsx`:
- props에 추가: `initialBid?: PgRfpDetailData['myBid'];` (타입은 `Bid` 또는 로더가 주는 형태에 맞춤)
- 초기 `fields` 상태를 `initialBid` 가 있으면 그 값으로 시드. settleCycle 파싱 등 변환은 작은 헬퍼로:
  ```typescript
  function bidToDraft(b: NonNullable<Props['initialBid']>): BidDraft {
    const m = /^([A-Z]+)\+?(\d+)?$/.exec(b.settleCycle);
    const fees: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.paymentFees ?? {})) {
      if (typeof v === 'number') fees[k] = String(v * 100);
    }
    for (const [k, v] of Object.entries(b.customFees ?? {})) fees[k] = String(v * 100);
    return {
      __v: 3,
      cycleUnit: (m?.[1] ?? 'D') as BidDraft['cycleUnit'],
      cycleNum: m?.[2] ?? '1',
      settleLimit: String(b.settleLimit ?? 0),
      guaranteeInsurance: String(b.guaranteeInsurance ?? 0),
      fees,
      memo: b.memo ?? '',
    };
  }
  ```
  `useState<BidDraft>(() => initialBid ? bidToDraft(initialBid) : { __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: {}, memo: '' })`.
  (TierRates(객체) 요율은 이 prefill에서 단순화로 생략 가능 — 단일요율만 prefill. 주석으로 명시.)
- 제출 성공 후 라우팅은 기존대로 `/inbox/${rfpCode}/submitted`.

- [ ] **Step 6: PgRfpDetailContent 분기 수정**

`components/inbox/PgRfpDetailContent.tsx`:
- 데이터 구조분해에 `pendingRequote` 추가: `const { rfp, myBid, buyerName, quoteTemplates, pendingRequote } = data;`
- 상단 import: `import { RequoteBanner } from './RequoteBanner';`
- 분기 로직 교체:
  ```tsx
  // 재요청 진행 중 → 배너 + prefill 폼(다시 제출 가능)
  if (pendingRequote) {
    return (
      <>
        <RequoteBanner message={pendingRequote.message} deadline={pendingRequote.deadline} />
        <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} initialBid={myBid} />
      </>
    );
  }
  if (myBid) { /* 기존 '견적을 보냈어요' 뷰 그대로 */ }
  if (variant === 'full') { return <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} />; }
  // peek 뷰 그대로…
  ```

- [ ] **Step 7: submitted 페이지도 재요청 시 폼으로 회귀** (선택적이지만 권장)

`app/(app)/inbox/[rfpId]/submitted/page.tsx`: pending 재요청이 있으면 종결 화면 대신 `/inbox/${rfpCode}` 로 redirect(거기서 PgRfpDetailContent 가 배너+폼 렌더). 구현:
```typescript
const pending = await (await getRfpRequoteRequestRepo()).findPendingByPair(rfp.id, session.user.workspaceId);
if (pending) redirect(`/inbox/${rfpCode}`);
```
(import: `getRfpRequoteRequestRepo`, `redirect`.)

- [ ] **Step 8: 컴포넌트 회귀 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/inbox`
Expected: PASS (기존 PgRfpDetailContent/BidWizard 테스트 회귀 없음 — 회귀 시 분기·prop 기본값 점검).

- [ ] **Step 9: 커밋**

```bash
git add components/inbox/RequoteBanner.tsx components/inbox/PgRfpDetailContent.tsx components/inbox/bid-wizard/BidWizard.tsx components/inbox/__tests__/RequoteBanner.test.tsx app/\(app\)/inbox/\[rfpId\]/submitted/page.tsx
git commit -m "feat(ui): PG 재요청 배너 + 직전 라운드 prefill 재제출 흐름"
```

---

### Task 12: 인박스 목록 재요청 태그

**Files:**
- Modify: `components/inbox/InboxList.tsx` (+ 데이터 소스 로더)
- Test: `components/inbox/__tests__/InboxList.test.tsx` (있으면 추가)

- [ ] **Step 1: 태그 실패 테스트 작성**

InboxList row 에 `hasRequote` (또는 stage 확장) 가 true 면 `재요청` 칩이 보이는지 검증. 기존 InboxList 테스트가 있으면 케이스 추가; 없으면 row 렌더 최소 테스트:
```tsx
it('renders a 재요청 chip when row.hasPendingRequote', () => {
  render(<InboxList rows={[{ /* 기존 row 필드 */, hasPendingRequote: true } as never]} />);
  expect(screen.getByText('재요청')).toBeInTheDocument();
});
```

- [ ] **Step 2: RED 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/inbox/__tests__/InboxList.test.tsx`
Expected: FAIL — `hasPendingRequote` 미반영 / 칩 없음.

- [ ] **Step 3: 구현**

- InboxList row 타입에 `hasPendingRequote?: boolean` 추가.
- 제목 셀(contractType 칩 인근)에 조건부 칩:
  ```tsx
  {row.hasPendingRequote && <Chip label="재요청" color="warning" />}
  ```
- 인박스 목록 데이터 로더(PG 인박스 list 를 만드는 곳; `grep -rn "InboxList" app lib components` 로 소스 확인)에서 각 row 의 `hasPendingRequote` 를 채운다: 해당 RFP·PG 의 `findPendingByPair` 결과 존재 여부. N+1 우려 시, 로더에서 `findByRfp` 들을 모아 pgWsId 기준 pending 존재 맵을 만들어 채운다.

- [ ] **Step 4: GREEN 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project unit-jsdom components/inbox/__tests__/InboxList.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/InboxList.tsx components/inbox/__tests__/InboxList.test.tsx
git commit -m "feat(ui): PG 인박스 목록에 재요청 태그"
```

---

## Phase 7 — e2e & 최종 검증

### Task 13: e2e 시나리오 — 재요청 → 재제출 → 선정

**Files:**
- Create: `e2e/scenario-e-requote.spec.ts`
- (참고) `e2e/_helpers.ts`, `e2e/scenario-c-buyer-award.spec.ts`

- [ ] **Step 1: e2e 스펙 작성** (scenario-c 패턴 차용)

`e2e/scenario-e-requote.spec.ts` — 시드 RFP를 `sent`로 리셋하고 토스 PG 의 round-1 bid 를 보장한 뒤: 구매사 로그인 → 비교 화면 → `견적 재요청` → 다이얼로그에서 토스 선택+메시지+마감 → 전송 → DB에 `rfp_requote_requests`(round 2, pending) 1건·`rfp.requote_requested` outbox·notifications 확인. 이어서 토스 PG 로그인 → `/inbox/<code>` 에서 재요청 배너 확인 → 재제출 → `bids` round 2 행·요청 `responded` 확인. (구조·DB assertion·login 헬퍼는 scenario-c 그대로 차용. 셀렉터: `getByRole('button', { name: /견적 재요청/ })`, 체크박스 `getByLabelText`, `getByRole('button', { name: '재요청 보내기' })`.)

선행 DB 셋업은 scenario-c 의 "토스 bid 복구" SQL을 차용하되 `ON CONFLICT (rfp_id, pg_ws_id, round)` 로 수정하고 `round` 컬럼을 명시(`, 1,` 위치)할 것. 기존 `rfp_requote_requests` 잔여 정리: `DELETE FROM rfp_requote_requests WHERE rfp_id=<uuid>`.

- [ ] **Step 2: e2e 실행 (DB 준비 필요)**

```bash
docker compose --profile test up -d pg-test   # :5433
pnpm e2e:reset
pnpm e2e -- --grep "Scenario E" > /tmp/e2e-requote.log 2>&1; echo "exit=$?"; tail -40 /tmp/e2e-requote.log
```
Expected: 1 passed. (piping 으로 exit code 마스킹되니 `echo exit=$?` 확인.)

- [ ] **Step 3: 커밋**

```bash
git add e2e/scenario-e-requote.spec.ts
git commit -m "test(e2e): 재요청 → 재제출 → 선정 시나리오"
```

---

### Task 14: 전체 헬스 + 회귀

- [ ] **Step 1: 타입체크**

Run: `pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach|afterEach)'" | head -40`
Expected: 신규 에러 없음. (vitest 글로벌 미import 노이즈는 사전존재 — 메모리 참조. 무시.)

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: 전체 유닛**

Run: `pnpm test`
Expected: 전 그린. (RAM 부족 시 프로젝트 분리 실행: `pnpm test --project unit-node` → `--project unit-jsdom`.)

- [ ] **Step 4: 스펙 커버리지 자가점검** (아래 Self-Review 표와 대조). 누락 시 해당 Task 보강.

- [ ] **Step 5: /ship 준비 메모**

배포 시 주의(스펙 §마이그레이션): 추가형(`bids.round`, `rfp_requote_requests`, enum)은 push 안전, 단 `bids` UNIQUE 교체는 surgical ALTER(`DROP CONSTRAINT bids_rfp_pg_unique` → `ADD UNIQUE(rfp_id, pg_ws_id, round)`) 필요. PR 본문에 명시.

---

## Self-Review (스펙 ↔ 플랜 대조)

| 스펙 요구 | 구현 Task |
|---|---|
| `bids.round` + `UNIQUE(rfp,pg,round)` | Task 1, 2 |
| 신규 `rfp_requote_requests` + `pending/responded` enum | Task 2 |
| `RfpRequoteRequestRepo` (create/findByRfp/findPendingByPair/markResponded) | Task 3 |
| `rfp.requote_requested` outbox 이벤트 + 이메일 템플릿 | Task 4 |
| `BidService.submit` 3-way 라운드 분기 + deadline 가드 + responded 마킹 | Task 5 |
| `RfpService.requote` (가드: sent·미래마감·≥1대상·입찰자·중복pending·소유권) + deadline 갱신 + 알림/이메일 | Task 6 |
| `requestRequoteAction` (buyer 세션 + zod 필수 메시지/미래마감/≥1대상) | Task 7 |
| 로더: PG별 최신 라운드 견적 + 재요청 정보(buyer `requoteByPg`/`priorBidByPg`, PG `pendingRequote`) | Task 8 |
| 구매사 `RequoteDialog`(다중선택·필수 메시지·새 마감일) | Task 9 |
| 비교 화면 재요청 CTA + `재요청함·응답대기`/`재제출됨`/`N차` 칩 | Task 10 |
| PG 재요청 배너 + 직전 라운드 prefill 재제출 + submitted 회귀 | Task 11 |
| PG 인박스 목록 `재요청` 태그 | Task 12 |
| e2e 재요청→재제출→선정 | Task 13 |
| 봉인입찰 무결성(1:1 신호, 교차 누출 없음) | 설계상 — 재요청은 대상 PG에게만 알림/이메일, 비교 화면은 buyer 전용. 별도 코드 없음(불변식 유지). |
| 마감 latest-wins | Task 6 (`rfpRepo.update deadline = newDeadline`) |
| 응답 안 함 = pending lapse, 1차 유효 | Task 5·8 (current bid = max submitted round; pending 미응답 시 round-1 유효) |

**Placeholder 스캔:** TODO/TBD 없음. 모든 코드 스텝에 실제 코드 포함. UI 칩/델타의 시각 폴리시는 Task 10·11에 구체 코드 제공.

**타입 일관성:** `RfpRequoteRequest`(round:number, deadline:string ISO, status 'pending'|'responded') 전 Task 동일. `Bid.round:number` Task 1 정의 후 5·6·8·11에서 일관 사용. 서비스 생성자 인자 순서(둘 다 **마지막**에 requoteRepo) Task 5·6 일관.

**확인 필요(구현 중 grep로 검증할 가정):** ① `RfpRepo` 에 deadline-only update 메서드 이름 ② `WorkspaceRepo` 의 admin 멤버(userId+email) 조회 수단 ③ PG 로더의 bids 변수명·`PgRfpDetailData.myBid` 형태 ④ InboxList row 데이터 소스 위치. 각 Task 본문에 grep 명령 명시.
