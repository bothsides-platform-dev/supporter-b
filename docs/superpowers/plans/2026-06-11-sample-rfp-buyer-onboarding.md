# 샘플 견적 요청 (구매사 온보딩) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규/기존 구매사에게 받은 견적이 있는 샘플 견적 요청 1건을 시드해 비교·선정 흐름을 바로 체험하게 하고, 보기·비교 전용 샌드박스로 동작시키며, 수동 영속 삭제를 제공한다.

**Architecture:** 아키텍처 A — 샘플을 실제 `rfps`/`bids` 로우로 심어 실제 코드 경로(목록·상세·비교 로더)를 그대로 재사용한다. 가공의 전역 데모 PG 워크스페이스(`isDemo`)가 비더가 되고, `rfps.isSample`이 칩/샌드박스/삭제 게이트를 구동하며, `workspaces.sampleSeededAt`이 시드 멱등성과 삭제 영속성의 단일 근거다. 시딩 로직은 `defaultColumns`처럼 순수 tx 함수로 두고, `createWorkspaceInTx`(신규)·백필 스크립트(기존)·`OnboardingService`(삭제)가 호출한다.

**Tech Stack:** Next.js App Router, Drizzle ORM + Postgres, Auth.js v5, zod + Server Actions, @base-ui/react, Vitest + PGlite (단위), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-11-sample-rfp-buyer-onboarding-design.md`

---

## Conventions (read once)

- **TDD 필수**: 각 태스크는 실패하는 테스트를 먼저 작성하고 `pnpm test <path>`로 **RED를 직접 확인한 뒤** 최소 구현한다. RED를 못 봤으면 그 테스트는 무효다.
- **Node 20 필수**: 이 머신의 homebrew node는 26이라 jsdom/PGlite 테스트가 깨진다. 모든 테스트 명령은 다음 prefix로 실행한다:
  `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test <path>`
  (아래 스텝에서는 `pnpm test <path>`로 줄여 쓰되 항상 이 prefix를 붙인다.)
- **단위 테스트는 단일 파일로** 빠르게 RED/GREEN 확인. 전체 그린은 마지막 Task에서.
- **Worktree에서 작업**: 실행 전 `feat/sample-rfp-onboarding` worktree 생성(`superpowers:using-git-worktrees`). 스펙 문서는 이미 `dev`에 커밋돼 있어 worktree base에 포함된다.
- **숫자 컬럼(numeric)** 은 drizzle insert에서 **문자열**로 전달한다(`settleLimit: '50000000'`). JSONB는 객체 그대로.
- **`declare global { var ... }`** 블록에는 `// eslint-disable-next-line no-var`를 붙인다(RTK lint와 호환 — 제거 금지).

---

## File Structure

**생성:**
- `lib/server/onboarding/sample-rfp.ts` — 순수 tx 시딩/삭제/백필 함수 + 상수(데모 PG·샘플 콘텐츠). DB import 없음(스키마·`nextRfpId`만).
- `lib/server/onboarding/__tests__/sample-rfp.test.ts` — 시딩/삭제/백필 단위 테스트.
- `lib/server/services/onboarding.ts` — `OnboardingService`(tx 래퍼) + 싱글턴 getter + 테스트 헬퍼.
- `lib/server/services/__tests__/onboarding.test.ts`
- `lib/server/actions/onboarding/deleteSampleRfpAction.ts` — 얇은 액션.
- `lib/server/actions/onboarding/__tests__/deleteSampleRfpAction.test.ts`
- `components/rfp/SampleRfpBanner.tsx` — 상세 페이지 샘플 안내 배너 + 삭제 플로우.
- `components/rfp/__tests__/SampleRfpBanner.test.tsx`
- `components/rfp/comparison/__tests__/FocusComparison.sample.test.tsx`
- `components/rfp/__tests__/RfpListTable.sample.test.tsx`
- `lib/server/__tests__/buyer-kanban-sample.test.ts`
- `lib/server/repositories/drizzle/__tests__/rfp-isSample.test.ts`
- `lib/server/repositories/drizzle/__tests__/rfp-pg-request-sample.test.ts`
- `scripts/backfill-sample-rfp.ts` — 1회성 러너(얇음).

**수정:**
- `lib/db/schema/rfps.ts` (`is_sample`), `lib/db/schema/workspaces.ts` (`is_demo`, `sample_seeded_at`)
- `lib/types/rfp.ts` (`isSample`), `lib/server/repositories/drizzle/rfp.ts` (rowToRfp 매핑)
- `lib/server/actions/workspace/_createWorkspace.ts` (buyer 시드 훅)
- `lib/server/repositories/drizzle/rfp-pg-request.ts` (게시판 쿼리 isSample 제외)
- `components/rfp/comparison/FocusComparison.tsx` (샌드박스 게이트)
- `components/rfp/RfpDetailContent.tsx` (배너·칩·채팅 토글 게이트)
- `app/(app)/rfp/[id]/page.tsx` (ChatRail 게이트)
- `components/rfp/RfpListTable.tsx` (칩 + 행 삭제)
- `lib/server/buyer-kanban.ts` + `components/board/PipelineCard.tsx` (보드 카드 칩)
- `SCREEN_DESIGN.md` (샘플 온보딩 등록)

---

## Task 1: 스키마 컬럼 + RFP 타입 + rowToRfp 매핑

**Files:**
- Modify: `lib/db/schema/rfps.ts`, `lib/db/schema/workspaces.ts`
- Modify: `lib/types/rfp.ts`, `lib/server/repositories/drizzle/rfp.ts:46-58`
- Test: `lib/server/repositories/drizzle/__tests__/rfp-isSample.test.ts`

- [ ] **Step 1: 스키마 컬럼 추가 (테스트 DDL이 컬럼을 갖도록 먼저 추가)**

`lib/db/schema/rfps.ts` — `boardVisible` 정의 바로 뒤(라인 75 다음)에 추가:

```ts
    // 온보딩 샘플 RFP 표식. true면 '샘플' 칩·읽기전용 샌드박스·전용 하드삭제 게이트가 켜진다.
    isSample: boolean('is_sample').notNull().default(false),
```

`lib/db/schema/workspaces.ts` — `canonicalPgKey` 정의 뒤에 추가(`boolean`,`timestamp` 이미 import됨):

```ts
    // 가공의 데모 PG(샘플 견적의 비더) 표식. true면 실제 PG 발견 표면에서 제외.
    isDemo: boolean('is_demo').notNull().default(false),
    // 이 구매사 워크스페이스에 온보딩 샘플을 심은 시각. 시드 멱등성 + 삭제 영속성의 근거.
    sampleSeededAt: timestamp('sample_seeded_at', { withTimezone: true }),
```

- [ ] **Step 2: RFP 타입에 isSample 추가**

`lib/types/rfp.ts` — `boardVisible?` 뒤(라인 42 다음)에:

```ts
  // 온보딩 샘플 RFP 여부. 목록·상세에서 '샘플' 칩 + 읽기전용 샌드박스를 구동.
  isSample?: boolean;
```

- [ ] **Step 3: 실패하는 매핑 테스트 작성**

`lib/server/repositories/drizzle/__tests__/rfp-isSample.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest, getRfpRepo } from '@/lib/server/repositories/factory';
import { rfps } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('rowToRfp isSample mapping', () => {
  it('maps rfps.is_sample → RFP.isSample', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const code = `P-2606-${Math.floor(1000 + Math.random() * 8999)}`;
    await db.insert(rfps).values({
      id: randomUUID(),
      code,
      buyerWsId: ws.id,
      title: 'sample',
      deadline: new Date(Date.now() + 1000),
      createdBy: u.id,
      isSample: true,
    });
    const repo = await getRfpRepo();
    const found = await repo.findByCode(code);
    expect(found?.isSample).toBe(true);
  });
});
```

- [ ] **Step 4: RED 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-isSample.test.ts`
Expected: FAIL — `expected undefined to be true` (rowToRfp가 아직 isSample을 매핑하지 않음).

- [ ] **Step 5: rowToRfp 매핑 추가**

`lib/server/repositories/drizzle/rfp.ts` — `rowToRfp` 반환 객체에서 `boardVisible: row.boardVisible,`(라인 57) 다음에:

```ts
    isSample: row.isSample,
```

- [ ] **Step 6: GREEN 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-isSample.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema/rfps.ts lib/db/schema/workspaces.ts lib/types/rfp.ts lib/server/repositories/drizzle/rfp.ts lib/server/repositories/drizzle/__tests__/rfp-isSample.test.ts
git commit -m "feat(onboarding): add isSample/isDemo/sampleSeededAt columns + RFP.isSample mapping"
```

---

## Task 2: ensureDemoPgs — 전역 데모 PG 비더

**Files:**
- Create: `lib/server/onboarding/sample-rfp.ts`
- Test: `lib/server/onboarding/__tests__/sample-rfp.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/onboarding/__tests__/sample-rfp.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { workspaces, workspaceMembers, users } from '@/lib/db/schema';
import { ensureDemoPgs, DEMO_PG_NAMES } from '../sample-rfp';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('ensureDemoPgs', () => {
  it('creates 3 demo PG workspaces + demo users, idempotently', async () => {
    const first = await db.transaction((tx) => ensureDemoPgs(tx));
    expect(first).toHaveLength(3);
    expect(first.map((d) => d.name)).toEqual([...DEMO_PG_NAMES]);

    const second = await db.transaction((tx) => ensureDemoPgs(tx));
    // same workspace ids returned (no duplicates created)
    expect(second.map((d) => d.wsId).sort()).toEqual(first.map((d) => d.wsId).sort());

    const demoWs = await db.select().from(workspaces).where(eq(workspaces.isDemo, true));
    expect(demoWs).toHaveLength(3);
    const sys = await db.select().from(users).where(eq(users.isSystemAccount, true));
    expect(sys).toHaveLength(3);
    // each demo ws has an admin membership
    for (const d of first) {
      const [m] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, d.wsId), eq(workspaceMembers.userId, d.userId)));
      expect(m.role).toBe('admin');
    }
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/onboarding/__tests__/sample-rfp.test.ts`
Expected: FAIL — `Cannot find module '../sample-rfp'`.

- [ ] **Step 3: sample-rfp.ts 생성 (ensureDemoPgs + 상수)**

`lib/server/onboarding/sample-rfp.ts`:

```ts
// 온보딩 샘플 견적 요청 — 순수 tx 시딩/삭제 로직 (DB 클라이언트 import 없음).
// createWorkspaceInTx(신규 구매사)·backfill 스크립트(기존)·OnboardingService(삭제)가 호출.
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  bids,
  rfpAllowedPg,
  rfpInvitations,
  rfps,
  users,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { nextRfpId } from '@/lib/server/rfp-id';

export const DEMO_PG_NAMES = ['샘플페이 A', '샘플페이 B', '샘플페이 C'] as const;

export type DemoPg = { wsId: string; userId: string; name: string };

// 샘플이 '마감' 상태로 노후화되지 않도록 마감일을 충분히 먼 미래로 둔다.
const SAMPLE_DEADLINE_MS = 3650 * 24 * 60 * 60 * 1000;

/**
 * 전역 데모 PG 워크스페이스 3개(+로그인 불가 데모 유저)를 보장한다. 이름 기준 멱등 —
 * 모든 구매사의 샘플이 이 3개를 공유한다. isDemo=true 로 실제 PG 발견 표면에서 제외된다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDemoPgs(tx: any): Promise<DemoPg[]> {
  const out: DemoPg[] = [];
  for (let i = 0; i < DEMO_PG_NAMES.length; i++) {
    const name = DEMO_PG_NAMES[i];
    const [existing] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.isDemo, true), eq(workspaces.name, name)))
      .limit(1);
    if (existing) {
      const [member] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, existing.id))
        .limit(1);
      out.push({ wsId: existing.id, userId: member.userId, name });
      continue;
    }
    const wsId = randomUUID();
    const userId = randomUUID();
    const slug = String.fromCharCode(97 + i); // a, b, c
    await tx.insert(users).values({
      id: userId,
      email: `demo-pg-${slug}@sample.invalid`, // .invalid = 예약된 비배달 TLD
      passwordHash: '!', // 사용 불가 — 데모 계정은 절대 인증되지 않는다
      name,
      isSystemAccount: true,
      emailVerified: true,
    });
    await tx.insert(workspaces).values({
      id: wsId,
      type: 'pg',
      name,
      status: 'active',
      isDemo: true,
    });
    await tx.insert(workspaceMembers).values({ workspaceId: wsId, userId, role: 'admin' });
    out.push({ wsId, userId, name });
  }
  return out;
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/onboarding/__tests__/sample-rfp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/onboarding/sample-rfp.ts lib/server/onboarding/__tests__/sample-rfp.test.ts
git commit -m "feat(onboarding): ensureDemoPgs — global demo PG bidders"
```

---

## Task 3: seedSampleRfpInTx — 버킷당 샘플 시드

**Files:**
- Modify: `lib/server/onboarding/sample-rfp.ts`
- Test: `lib/server/onboarding/__tests__/sample-rfp.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/server/onboarding/__tests__/sample-rfp.test.ts` 하단에 추가(import에 `rfps, bids, rfpInvitations, rfpAllowedPg` 보강):

```ts
import { seedBuyerWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { seedSampleRfpInTx } from '../sample-rfp';
import { rfps, bids, rfpInvitations, rfpAllowedPg } from '@/lib/db/schema';

describe('seedSampleRfpInTx', () => {
  it('seeds 1 sample RFP (sent, boardVisible=false) + 3 submitted bids + invites + allowlist, sets sampleSeededAt', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const r = await db.transaction((tx) =>
      seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }),
    );
    expect(r.seeded).toBe(true);

    const [rfp] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
    expect(rfp.isSample).toBe(true);
    expect(rfp.status).toBe('sent');
    expect(rfp.boardVisible).toBe(false);
    expect(rfp.buyerWsId).toBe(ws.id);

    const bidRows = await db.select().from(bids).where(eq(bids.rfpId, r.rfpId!));
    expect(bidRows).toHaveLength(3);
    expect(bidRows.every((b) => b.status === 'submitted')).toBe(true);

    const invRows = await db.select().from(rfpInvitations).where(eq(rfpInvitations.rfpId, r.rfpId!));
    expect(invRows).toHaveLength(3);
    expect(invRows.every((iv) => iv.status === 'accepted')).toBe(true);

    const allow = await db.select().from(rfpAllowedPg).where(eq(rfpAllowedPg.rfpId, r.rfpId!));
    expect(allow).toHaveLength(3);

    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.sampleSeededAt).not.toBeNull();
  });

  it('is idempotent — second call is a no-op when sampleSeededAt is set', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    await db.transaction((tx) => seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }));
    const second = await db.transaction((tx) =>
      seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }),
    );
    expect(second.seeded).toBe(false);
    const all = await db.select().from(rfps).where(eq(rfps.buyerWsId, ws.id));
    expect(all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/onboarding/__tests__/sample-rfp.test.ts`
Expected: FAIL — `seedSampleRfpInTx is not a function` / not exported.

- [ ] **Step 3: seedSampleRfpInTx + 샘플 콘텐츠 상수 추가**

`lib/server/onboarding/sample-rfp.ts`의 `ensureDemoPgs` 위(상수 영역)에 추가:

```ts
type SampleBidSpec = {
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  // PaymentMethod → 단일요율(number) 또는 우대수수료 구간맵(TierRates)
  paymentFees: Record<string, number | Record<string, number>>;
  memo: string;
};

// 세 비더를 의도적으로 차별화 — 비교가 의미를 갖도록.
const SAMPLE_BIDS: SampleBidSpec[] = [
  {
    settleCycle: 'D+2',
    settleLimit: '50000000',
    guaranteeInsurance: '5000000',
    paymentFees: {
      card: { sole: 0.005, sme1: 0.008, sme2: 0.011, sme3: 0.013, general: 0.018 },
      virtual_account: 0.003,
      naver_pay: 0.025,
    },
    memo: '카드 수수료가 가장 낮아요. 정산은 D+2예요.',
  },
  {
    settleCycle: 'D+1',
    settleLimit: '100000000',
    guaranteeInsurance: '3000000',
    paymentFees: {
      card: { sole: 0.006, sme1: 0.009, sme2: 0.012, sme3: 0.015, general: 0.02 },
      virtual_account: 0.0025,
      naver_pay: 0.023,
    },
    memo: '정산이 D+1로 빠르고 한도가 높아요.',
  },
  {
    settleCycle: 'D+1',
    settleLimit: '80000000',
    guaranteeInsurance: '0',
    paymentFees: {
      card: { sole: 0.007, sme1: 0.01, sme2: 0.013, sme3: 0.016, general: 0.022 },
      virtual_account: 0.002,
      naver_pay: 0.019,
    },
    memo: '간편결제 수수료가 낮고 보증보험이 없어요.',
  },
];
```

같은 파일 하단(`ensureDemoPgs` 뒤)에 추가:

```ts
/**
 * 구매사 워크스페이스에 샘플 견적 요청 1건 + 데모 PG 3사의 견적을 시드한다.
 * sampleSeededAt 가 이미 설정돼 있으면 no-op(멱등). 반드시 tx 안에서 호출.
 */
export async function seedSampleRfpInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { buyerWsId: string; buyerUserId: string },
): Promise<{ seeded: boolean; rfpId?: string }> {
  const [ws] = await tx
    .select({ sampleSeededAt: workspaces.sampleSeededAt })
    .from(workspaces)
    .where(eq(workspaces.id, input.buyerWsId))
    .limit(1);
  if (!ws || ws.sampleSeededAt) return { seeded: false };

  const demos = await ensureDemoPgs(tx);
  const now = new Date();
  const deadline = new Date(now.getTime() + SAMPLE_DEADLINE_MS);
  const rfpId = randomUUID();
  const code = await nextRfpId(tx);

  await tx.insert(rfps).values({
    id: rfpId,
    code,
    buyerWsId: input.buyerWsId,
    title: '온라인 쇼핑몰 PG 견적 요청 (샘플)',
    memo: '결제대행사 비교를 위한 샘플 견적 요청이에요. 받은 견적을 비교하고 선정하는 과정을 둘러볼 수 있어요. 다 살펴봤다면 삭제해도 돼요.',
    mainProducts: '패션 의류 · 잡화',
    annualPgVolume: '1200000000',
    currentFeeRate: '2.8%',
    currentSettlementCycle: 'D+5',
    currentSettlementLimit: '30000000',
    currentGuaranteeInsurance: '없음',
    requiredPaymentMethods: ['card', 'virtual_account', 'naver_pay'],
    deadline,
    status: 'sent',
    boardVisible: false,
    isSample: true,
    createdBy: input.buyerUserId,
    sentAt: now,
  });

  for (let i = 0; i < demos.length; i++) {
    const demo = demos[i];
    const spec = SAMPLE_BIDS[i];
    const invitationId = randomUUID();
    await tx.insert(rfpAllowedPg).values({ rfpId, pgWsId: demo.wsId });
    await tx.insert(rfpInvitations).values({
      id: invitationId,
      rfpId,
      pgWsId: demo.wsId,
      acceptedByUserId: demo.userId,
      tokenHash: randomUUID(), // 샘플은 토큰 진입이 없어 임의 unique 값으로 충분
      sentAt: now,
      expiresAt: deadline,
      status: 'accepted',
    });
    await tx.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId: demo.wsId,
      invitationId,
      settleCycle: spec.settleCycle,
      settleLimit: spec.settleLimit,
      guaranteeInsurance: spec.guaranteeInsurance,
      paymentFees: spec.paymentFees,
      customFees: {},
      memo: spec.memo,
      status: 'submitted',
      submittedBy: demo.userId,
      submittedAt: now,
    });
  }

  await tx.update(workspaces).set({ sampleSeededAt: now }).where(eq(workspaces.id, input.buyerWsId));
  return { seeded: true, rfpId };
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/onboarding/__tests__/sample-rfp.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/server/onboarding/sample-rfp.ts lib/server/onboarding/__tests__/sample-rfp.test.ts
git commit -m "feat(onboarding): seedSampleRfpInTx — sample RFP + 3 differentiated bids"
```

---

## Task 4: createWorkspaceInTx 시드 훅 (신규 구매사)

**Files:**
- Modify: `lib/server/actions/workspace/_createWorkspace.ts`
- Test: `lib/server/actions/workspace/__tests__/createWorkspace.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/server/actions/workspace/__tests__/createWorkspace.test.ts`에 테스트 2개 추가(상단 import에 `rfps`,`bids` 보강, seedUser는 이미 사용 중):

```ts
import { rfps, bids } from '@/lib/db/schema';

it('buyer: seeds a sample RFP (isSample) with 3 bids', async () => {
  const u = await seedUser(db);
  const { workspaceId } = await createWorkspaceInTx(db, { userId: u.id, type: 'buyer', name: 'BuyerCo' });

  const sample = await db.select().from(rfps).where(eq(rfps.buyerWsId, workspaceId));
  expect(sample).toHaveLength(1);
  expect(sample[0].isSample).toBe(true);
  const bidRows = await db.select().from(bids).where(eq(bids.rfpId, sample[0].id));
  expect(bidRows).toHaveLength(3);
});

it('pg: does NOT seed a sample RFP', async () => {
  const u = await seedUser(db);
  const { workspaceId } = await createWorkspaceInTx(db, { userId: u.id, type: 'pg', name: 'NewPG' });
  const sample = await db.select().from(rfps).where(eq(rfps.buyerWsId, workspaceId));
  expect(sample).toHaveLength(0);
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/actions/workspace/__tests__/createWorkspace.test.ts`
Expected: FAIL — buyer 케이스가 `length 0`(시드 안 됨).

- [ ] **Step 3: 시드 훅 추가**

`lib/server/actions/workspace/_createWorkspace.ts`:
- 상단 import에 추가: `import { seedSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';`
- 컬럼 시드(라인 89 `await tx.insert(columns)...`) 다음, `return` 직전에 추가:

```ts
  // 구매사 온보딩: 샘플 견적 요청 1건 + 데모 PG 견적을 같은 tx 에 시드. (pg 는 시드 안 함)
  if (input.type === 'buyer') {
    await seedSampleRfpInTx(tx, { buyerWsId: wsId, buyerUserId: input.userId });
  }
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/actions/workspace/__tests__/createWorkspace.test.ts`
Expected: PASS (기존 + 신규 2 테스트).

- [ ] **Step 5: Commit**

```bash
git add lib/server/actions/workspace/_createWorkspace.ts lib/server/actions/workspace/__tests__/createWorkspace.test.ts
git commit -m "feat(onboarding): seed sample RFP on buyer workspace creation"
```

---

## Task 5: deleteSampleRfp — OnboardingService + 삭제 로직

**Files:**
- Modify: `lib/server/onboarding/sample-rfp.ts` (deleteSampleRfpInTx)
- Create: `lib/server/services/onboarding.ts`
- Test: `lib/server/services/__tests__/onboarding.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/services/__tests__/onboarding.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { rfps, bids, workspaces } from '@/lib/db/schema';
import { seedBuyerWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { seedSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';
import { OnboardingService } from '../onboarding';

let db: PgliteDB;
let svc: OnboardingService;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  svc = new OnboardingService(db);
});

async function seedSample(): Promise<{ wsId: string; userId: string; code: string }> {
  const u = await seedUser(db);
  const ws = await seedBuyerWorkspace(db);
  const r = await db.transaction((tx) => seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }));
  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
  return { wsId: ws.id, userId: u.id, code: rfp.code };
}

describe('OnboardingService.deleteSampleRfp', () => {
  it('hard-deletes the sample + cascades bids, keeps sampleSeededAt', async () => {
    const s = await seedSample();
    const res = await svc.deleteSampleRfp(s.code, { userId: s.userId, workspaceId: s.wsId });
    expect(res.ok).toBe(true);
    expect(await db.select().from(rfps).where(eq(rfps.code, s.code))).toHaveLength(0);
    expect(await db.select().from(bids)).toHaveLength(0);
    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, s.wsId));
    expect(w.sampleSeededAt).not.toBeNull(); // 재시드 안 함
  });

  it('refuses a non-sample RFP (NOT_SAMPLE)', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const code = `P-2606-${Math.floor(1000 + Math.random() * 8999)}`;
    await db.insert(rfps).values({
      id: randomUUID(), code, buyerWsId: ws.id, title: 'real',
      deadline: new Date(Date.now() + 1000), createdBy: u.id, isSample: false,
    });
    const res = await svc.deleteSampleRfp(code, { userId: u.id, workspaceId: ws.id });
    expect(res).toEqual({ ok: false, error: 'NOT_SAMPLE' });
    expect(await db.select().from(rfps).where(eq(rfps.code, code))).toHaveLength(1);
  });

  it('refuses another workspace\'s sample (FORBIDDEN)', async () => {
    const s = await seedSample();
    const res = await svc.deleteSampleRfp(s.code, { userId: s.userId, workspaceId: randomUUID() });
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await db.select().from(rfps).where(eq(rfps.code, s.code))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/services/__tests__/onboarding.test.ts`
Expected: FAIL — `Cannot find module '../onboarding'`.

- [ ] **Step 3: deleteSampleRfpInTx 추가**

`lib/server/onboarding/sample-rfp.ts` 하단에:

```ts
/**
 * 샘플 견적 요청 하드삭제. 소유권(workspaceId) + isSample 둘 다 만족할 때만 삭제한다.
 * 실제 RFP 는 이 경로로 절대 삭제되지 않는다. 자식(bids·invitations·allowlist·attachments·
 * team_messages)은 FK ON DELETE CASCADE 로 함께 제거된다. sampleSeededAt 은 유지 → 재시드 안 함.
 */
export async function deleteSampleRfpInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { code: string; workspaceId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [rfp] = await tx
    .select({ id: rfps.id, buyerWsId: rfps.buyerWsId, isSample: rfps.isSample })
    .from(rfps)
    .where(eq(rfps.code, input.code))
    .limit(1);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (rfp.buyerWsId !== input.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  if (!rfp.isSample) return { ok: false, error: 'NOT_SAMPLE' };
  await tx.delete(rfps).where(eq(rfps.id, rfp.id));
  return { ok: true };
}
```

> 구현 중 확인: `rfp_invitations.rfp_id`·`rfp_allowed_pg.rfp_id`·`bids.rfp_id` 는 ON DELETE CASCADE 확인됨. `attachments`·`rfp_team_messages` 의 rfpId FK 가 CASCADE 인지 스키마에서 확인하고, 아니면 `tx.delete(...)` 로 자식을 먼저 명시 삭제(샘플엔 첨부·팀메시지가 없어 실사용 영향은 없음).

- [ ] **Step 4: OnboardingService 생성**

`lib/server/services/onboarding.ts`:

```ts
import type { Actor, ServiceResult } from './types';
import { seedSampleRfpInTx, deleteSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';

export class OnboardingService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: any) {}

  async seedSampleRfp(input: { buyerWsId: string; buyerUserId: string }): Promise<{ seeded: boolean; rfpId?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction((tx: any) => seedSampleRfpInTx(tx, input));
  }

  async deleteSampleRfp(code: string, actor: Actor): Promise<ServiceResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction((tx: any) => deleteSampleRfpInTx(tx, { code, workspaceId: actor.workspaceId }));
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __bidit_onboarding_service__: OnboardingService | undefined;
}

export async function getOnboardingService(): Promise<OnboardingService> {
  if (!globalThis.__bidit_onboarding_service__) {
    const { db } = await import('@/lib/db/client');
    globalThis.__bidit_onboarding_service__ = new OnboardingService(db);
  }
  return globalThis.__bidit_onboarding_service__!;
}

export function __resetOnboardingServiceForTest(): void {
  globalThis.__bidit_onboarding_service__ = undefined;
}

export function __setOnboardingServiceForTest(service: OnboardingService): void {
  globalThis.__bidit_onboarding_service__ = service;
}
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test lib/server/services/__tests__/onboarding.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/server/onboarding/sample-rfp.ts lib/server/services/onboarding.ts lib/server/services/__tests__/onboarding.test.ts
git commit -m "feat(onboarding): OnboardingService.deleteSampleRfp — gated hard-delete"
```

---

## Task 6: deleteSampleRfpAction

**Files:**
- Create: `lib/server/actions/onboarding/deleteSampleRfpAction.ts`
- Test: `lib/server/actions/onboarding/__tests__/deleteSampleRfpAction.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/actions/onboarding/__tests__/deleteSampleRfpAction.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OnboardingService,
  __setOnboardingServiceForTest,
  __resetOnboardingServiceForTest,
} from '@/lib/server/services/onboarding';

vi.mock('@/lib/auth/session', () => ({
  requireBuyerSession: vi.fn(async () => ({ user: { id: 'u1', workspaceId: 'ws1' } })),
}));

import { deleteSampleRfpAction } from '../deleteSampleRfpAction';
import { requireBuyerSession } from '@/lib/auth/session';

afterEach(() => {
  __resetOnboardingServiceForTest();
  vi.clearAllMocks();
});

describe('deleteSampleRfpAction', () => {
  it('delegates to OnboardingService.deleteSampleRfp with session actor', async () => {
    const spy = vi.fn(async () => ({ ok: true as const }));
    const fake = Object.assign(Object.create(OnboardingService.prototype), { deleteSampleRfp: spy });
    __setOnboardingServiceForTest(fake);

    const res = await deleteSampleRfpAction({ code: 'P-2606-0001' });
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('P-2606-0001', { userId: 'u1', workspaceId: 'ws1' });
  });

  it('returns FORBIDDEN_BUYER when session check throws', async () => {
    (requireBuyerSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no'));
    const res = await deleteSampleRfpAction({ code: 'P-2606-0001' });
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN_BUYER' });
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/actions/onboarding/__tests__/deleteSampleRfpAction.test.ts`
Expected: FAIL — `Cannot find module '../deleteSampleRfpAction'`.

- [ ] **Step 3: 액션 작성**

`lib/server/actions/onboarding/deleteSampleRfpAction.ts`:

```ts
'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getOnboardingService } from '@/lib/server/services/onboarding';

const Input = z.object({ code: z.string().min(1) }).strict();

export type DeleteSampleRfpInput = z.infer<typeof Input>;
export type DeleteSampleRfpResult = { ok: true } | { ok: false; error: string };

/** 온보딩 샘플 견적 요청 삭제. 세션/입력 파싱 후 OnboardingService 에 위임. */
export async function deleteSampleRfpAction(
  input: DeleteSampleRfpInput,
): Promise<DeleteSampleRfpResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getOnboardingService();
  return service.deleteSampleRfp(parsed.data.code, {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  });
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/actions/onboarding/__tests__/deleteSampleRfpAction.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/server/actions/onboarding/
git commit -m "feat(onboarding): deleteSampleRfpAction"
```

---

## Task 7: 게시판 쿼리에서 샘플 제외 (누수 방어)

**Files:**
- Modify: `lib/server/repositories/drizzle/rfp-pg-request.ts:120-138`
- Test: `lib/server/repositories/drizzle/__tests__/rfp-pg-request-sample.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/repositories/drizzle/__tests__/rfp-pg-request-sample.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest, getPgRequestRepo } from '@/lib/server/repositories/factory';
import { rfps } from '@/lib/db/schema';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('findOpenRfpsForPg excludes sample RFPs', () => {
  it('does not surface a sample RFP even if boardVisible=true', async () => {
    const u = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    const pg = await seedPgWorkspace(db);
    await db.insert(rfps).values({
      id: randomUUID(),
      code: `P-2606-${Math.floor(1000 + Math.random() * 8999)}`,
      buyerWsId: buyer.id,
      title: 'sample on board',
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      status: 'sent',
      boardVisible: true, // 일부러 노출로 둬도
      isSample: true,
      createdBy: u.id,
    });
    const repo = await getPgRequestRepo();
    const open = await repo.findOpenRfpsForPg(pg.id, new Date());
    expect(open).toHaveLength(0); // 샘플은 제외돼야 함
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-pg-request-sample.test.ts`
Expected: FAIL — `expected length 1 to be 0` (필터 없으면 샘플이 노출됨).

- [ ] **Step 3: isSample 제외 필터 추가**

`lib/server/repositories/drizzle/rfp-pg-request.ts` — `findOpenRfpsForPg`의 `.where(and(...))` 안, `eq(rfps.boardVisible, true),`(라인 124) 다음에 추가:

```ts
          eq(rfps.isSample, false),
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/rfp-pg-request-sample.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/repositories/drizzle/rfp-pg-request.ts lib/server/repositories/drizzle/__tests__/rfp-pg-request-sample.test.ts
git commit -m "fix(onboarding): exclude sample RFPs from PG open board query"
```

---

## Task 8: FocusComparison 샌드박스 (선정 비활성)

**Files:**
- Modify: `components/rfp/comparison/FocusComparison.tsx:34-45,99,322-326`
- Modify: `components/rfp/RfpDetailContent.tsx:176-192` (isSample prop 전달)
- Test: `components/rfp/comparison/__tests__/FocusComparison.sample.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`components/rfp/comparison/__tests__/FocusComparison.sample.test.tsx`:

```tsx
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FocusComparison } from '../FocusComparison';
import type { Bid } from '@/lib/types/bid';

beforeAll(() => {
  // jsdom 폴리필 (base-ui/cmdk 등)
  // @ts-expect-error test stub
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= () => {};
});

function bid(id: string, pgWsId: string): Bid {
  return {
    id, rfpId: 'r1', pgWsId, invitationId: 'i1',
    settleCycle: 'D+1', settleLimit: 50000000, guaranteeInsurance: 0,
    paymentFees: { card: 0.018 }, customFees: {}, proposalPdfs: [],
    status: 'submitted', submittedBy: 'u1',
  };
}

const baseProps = {
  bids: [bid('b1', 'pgA'), bid('b2', 'pgB')],
  pgWsNameMap: { pgA: '샘플페이 A', pgB: '샘플페이 B' },
  current: {},
  notesByBid: {},
  awardedBidId: null,
  requiredPaymentMethods: ['card'] as const,
  customPaymentMethods: [],
  rfpId: 'r1',
  rfpCode: 'P-2606-0001',
};

describe('FocusComparison sample sandbox', () => {
  it('shows the award CTA when not a sample', () => {
    render(<FocusComparison {...baseProps} rfpStatus="sent" />);
    expect(screen.getByText('이 견적 선정하기 →')).toBeInTheDocument();
  });

  it('hides the award CTA and shows a sample note when isSample', () => {
    render(<FocusComparison {...baseProps} rfpStatus="sent" isSample />);
    expect(screen.queryByText('이 견적 선정하기 →')).not.toBeInTheDocument();
    expect(screen.getByText('샘플에서는 선정할 수 없어요. 실제 견적 요청을 보내보세요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/rfp/comparison/__tests__/FocusComparison.sample.test.tsx`
Expected: FAIL — isSample 케이스에서 CTA가 여전히 보이고 note 가 없음.

- [ ] **Step 3: FocusComparison 게이트 추가**

`components/rfp/comparison/FocusComparison.tsx`:
- `type Props` 에 추가(`rfpCode: string;` 뒤):

```ts
  /** 온보딩 샘플 — 읽기전용 샌드박스(선정 비활성) */
  isSample?: boolean;
```

- `const canAward = rfpStatus === 'sent';`(라인 99) 를 다음으로 교체:

```ts
  const canAward = rfpStatus === 'sent' && !props.isSample;
```

- award 버튼 블록(`{canAward && (...)}`, 라인 322-326) **다음에** 추가:

```tsx
        {props.isSample && (
          <div className="pt-4 flex justify-end">
            <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
              샘플에서는 선정할 수 없어요. 실제 견적 요청을 보내보세요.
            </p>
          </div>
        )}
```

- [ ] **Step 4: RfpDetailContent 에서 prop 전달**

`components/rfp/RfpDetailContent.tsx` — `<FocusComparison ...>` 호출(라인 176-192)에서 `rfpCode={rfp.code}` 다음에 추가:

```tsx
        isSample={rfp.isSample ?? false}
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test components/rfp/comparison/__tests__/FocusComparison.sample.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add components/rfp/comparison/FocusComparison.tsx components/rfp/RfpDetailContent.tsx components/rfp/comparison/__tests__/FocusComparison.sample.test.tsx
git commit -m "feat(onboarding): sandbox sample RFP — disable award in FocusComparison"
```

---

## Task 9: SampleRfpBanner 컴포넌트 (삭제 플로우)

**Files:**
- Create: `components/rfp/SampleRfpBanner.tsx`
- Test: `components/rfp/__tests__/SampleRfpBanner.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`components/rfp/__tests__/SampleRfpBanner.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const deleteAction = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/deleteSampleRfpAction', () => ({
  deleteSampleRfpAction: (...a: unknown[]) => deleteAction(...a),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { SampleRfpBanner } from '../SampleRfpBanner';

describe('SampleRfpBanner', () => {
  it('confirms then calls deleteSampleRfpAction and navigates to /rfp', async () => {
    const user = userEvent.setup();
    render(<SampleRfpBanner rfpCode="P-2606-0001" />);

    await user.click(screen.getByRole('button', { name: '샘플 삭제' }));
    // 확인 다이얼로그의 '삭제' 확정 버튼
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(deleteAction).toHaveBeenCalledWith({ code: 'P-2606-0001' });
    expect(push).toHaveBeenCalledWith('/rfp');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/rfp/__tests__/SampleRfpBanner.test.tsx`
Expected: FAIL — `Cannot find module '../SampleRfpBanner'`.

- [ ] **Step 3: 컴포넌트 작성**

`components/rfp/SampleRfpBanner.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteSampleRfpAction } from '@/lib/server/actions/onboarding/deleteSampleRfpAction';
import { toast } from '@/lib/toast';

// 상세 페이지 상단 — 샘플 견적 요청 안내 + 삭제. rfp.isSample 일 때만 렌더.
export function SampleRfpBanner({ rfpCode }: { rfpCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    const r = await deleteSampleRfpAction({ code: rfpCode });
    if (!r.ok) {
      setBusy(false);
      toast(`삭제하지 못했어요 — ${r.error}`, { type: 'error' });
      return;
    }
    setOpen(false);
    toast('샘플 견적 요청을 삭제했어요.');
    startTransition(() => router.push('/rfp'));
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3">
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        둘러보기용 샘플 견적 요청이에요. 받은 견적을 비교하고 선정하는 과정을 살펴볼 수 있어요. 다 살펴봤다면 삭제해도 돼요.
      </p>
      <Button variant="outlined" size="sm" color="error" onClick={() => setOpen(true)}>
        샘플 삭제
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="샘플 견적 요청을 삭제할까요?"
        description="삭제하면 다시 표시되지 않아요."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={handleDelete}
        loading={busy}
      />
    </div>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/rfp/__tests__/SampleRfpBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/rfp/SampleRfpBanner.tsx components/rfp/__tests__/SampleRfpBanner.test.tsx
git commit -m "feat(onboarding): SampleRfpBanner — sample notice + delete flow"
```

---

## Task 10: 상세 페이지 통합 (배너·칩·채팅 게이트)

**Files:**
- Modify: `components/rfp/RfpDetailContent.tsx:82-95`
- Modify: `app/(app)/rfp/[id]/page.tsx:76`

- [ ] **Step 1: RfpDetailContent — 배너 + 헤더 칩 + 채팅 토글 게이트**

`components/rfp/RfpDetailContent.tsx`:
- 상단 import 추가: `import { SampleRfpBanner } from '@/components/rfp/SampleRfpBanner';`
- `return ( <> ` 직후(라인 82, `{/* Header */}` 위)에 배너 추가:

```tsx
      {rfp.isSample && <SampleRfpBanner rfpCode={rfp.code} />}
```

- 헤더 우측 그룹(라인 92-95)을 다음으로 교체:

```tsx
          <div className="flex shrink-0 items-center gap-2">
            {!rfp.isSample && <ChatRailToggle />}
            {rfp.isSample && <Chip label="샘플" color="surface" />}
            <Chip label={statusLabel[rfp.status]} color={statusColor[rfp.status]} />
          </div>
```

- [ ] **Step 2: page.tsx — 샘플이면 ChatRail 미렌더**

`app/(app)/rfp/[id]/page.tsx` — `<ChatRail .../>`(라인 76)을 다음으로 교체:

```tsx
      {!data.rfp.isSample && (
        <ChatRail rfpId={data.rfp.id} rfpCode={data.rfp.code} rfpTitle={data.rfp.title} />
      )}
```

- [ ] **Step 3: 검증 (typecheck + 기존 상세 테스트 회귀)**

Run: `pnpm test components/rfp/comparison/__tests__/FocusComparison.sample.test.tsx components/rfp/__tests__/SampleRfpBanner.test.tsx`
그리고: `pnpm tsc --noEmit`(전체 typecheck는 Task 15에서) — 최소 이 파일들이 컴파일되는지 확인.
Expected: 관련 테스트 PASS, 타입 에러 없음.

> 이 태스크는 단순 조립(조건부 렌더)이라 `app/**/page.tsx`·표현 컴포넌트 TDD 면제 범위. 동작 검증은 Task 8/9 테스트가 커버하고, 시각 확인은 Task 15 수동 QA에서.

- [ ] **Step 4: Commit**

```bash
git add components/rfp/RfpDetailContent.tsx "app/(app)/rfp/[id]/page.tsx"
git commit -m "feat(onboarding): wire sample banner + chip, hide chat on sample detail"
```

---

## Task 11: RfpListTable — 샘플 칩 + 행 삭제

**Files:**
- Modify: `components/rfp/RfpListTable.tsx`
- Test: `components/rfp/__tests__/RfpListTable.sample.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`components/rfp/__tests__/RfpListTable.sample.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RFP } from '@/lib/types/rfp';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/server/actions/onboarding/deleteSampleRfpAction', () => ({
  deleteSampleRfpAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { RfpListTable } from '../RfpListTable';

function rfp(over: Partial<RFP>): RFP {
  return {
    id: over.id ?? 'r1', code: over.code ?? 'P-2606-0001', buyerWsId: 'ws1',
    title: 't', memo: '', rfpFiles: [], allowedPgWorkspaceIds: [],
    deadline: new Date().toISOString(), status: 'sent', createdBy: 'u1',
    createdAt: new Date().toISOString(), requiredPaymentMethods: [], customPaymentMethods: [],
    ...over,
  };
}

describe('RfpListTable sample row', () => {
  it('renders a 샘플 chip and a 삭제 trigger for sample rows', () => {
    render(<RfpListTable rfps={[rfp({ isSample: true })]} />);
    expect(screen.getByText('샘플')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '샘플 삭제' })).toBeInTheDocument();
  });

  it('does not render delete trigger for normal rows', () => {
    render(<RfpListTable rfps={[rfp({ isSample: false })]} />);
    expect(screen.queryByRole('button', { name: '샘플 삭제' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/rfp/__tests__/RfpListTable.sample.test.tsx`
Expected: FAIL — `샘플` 칩/삭제 버튼이 없음.

- [ ] **Step 3: RfpListTable 수정**

`components/rfp/RfpListTable.tsx`:
- import 보강:

```ts
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteSampleRfpAction } from '@/lib/server/actions/onboarding/deleteSampleRfpAction';
import { toast } from '@/lib/toast';
```

- 컴포넌트 본문 상단(`const rowRefs = useRef...` 뒤)에 상태 추가:

```ts
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
```

- 상태 셀(라인 97-99)을 다음으로 교체:

```tsx
              <td className="px-3 py-4 text-right">
                <div className="inline-flex items-center gap-2">
                  {rfp.isSample && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteCode(rfp.code);
                      }}
                      className="font-mono text-[10px] text-[var(--md-sys-color-error)] hover:underline"
                      aria-label="샘플 삭제"
                    >
                      삭제
                    </button>
                  )}
                  {rfp.isSample && <Chip label="샘플" color="surface" />}
                  <Chip label={statusLabel[rfp.status]} color={statusColor[rfp.status]} />
                </div>
              </td>
```

- `</table>` 닫힘 **다음**, 바깥 `</div>` 안에 ConfirmDialog 추가:

```tsx
      <ConfirmDialog
        open={deleteCode !== null}
        onOpenChange={(o) => !busy && !o && setDeleteCode(null)}
        title="샘플 견적 요청을 삭제할까요?"
        description="삭제하면 다시 표시되지 않아요."
        confirmLabel="삭제"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          if (!deleteCode) return;
          setBusy(true);
          const r = await deleteSampleRfpAction({ code: deleteCode });
          setBusy(false);
          if (!r.ok) {
            toast(`삭제하지 못했어요 — ${r.error}`, { type: 'error' });
            return;
          }
          setDeleteCode(null);
          toast('샘플 견적 요청을 삭제했어요.');
          router.refresh();
        }}
      />
```

> 주의: ConfirmDialog 가 바깥 `<div className="flex-1 overflow-y-auto">` 안에 들어가도록 JSX 루트를 Fragment(`<> ... </>`)로 감싸야 할 수 있다. 현재 단일 `<div>` 반환이므로 `return ( <> <div...>...</div> <ConfirmDialog .../> </> )` 형태로 감싼다.

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/rfp/__tests__/RfpListTable.sample.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/rfp/RfpListTable.tsx components/rfp/__tests__/RfpListTable.sample.test.tsx
git commit -m "feat(onboarding): 샘플 chip + row delete in RfpListTable"
```

---

## Task 12: 보드 카드 샘플 칩

**Files:**
- Modify: `lib/server/buyer-kanban.ts:26-35,47-67`
- Modify: `components/board/PipelineCard.tsx` (BuyerBody, 라인 53-71)
- Test: `lib/server/__tests__/buyer-kanban-sample.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/__tests__/buyer-kanban-sample.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toBuyerCard } from '@/lib/server/buyer-kanban';
import type { RFP } from '@/lib/types/rfp';

function rfp(over: Partial<RFP>): RFP {
  return {
    id: 'r1', code: 'P-2606-0001', buyerWsId: 'ws1', title: 't', memo: '',
    rfpFiles: [], allowedPgWorkspaceIds: [], deadline: new Date().toISOString(),
    status: 'sent', createdBy: 'u1', createdAt: new Date().toISOString(),
    requiredPaymentMethods: [], customPaymentMethods: [], ...over,
  };
}

describe('toBuyerCard isSample', () => {
  it('carries isSample onto the card', () => {
    const card = toBuyerCard({ rfp: rfp({ isSample: true }), bids: [], invitations: [], stage: 'active' });
    expect(card.isSample).toBe(true);
  });
  it('defaults to false', () => {
    const card = toBuyerCard({ rfp: rfp({}), bids: [], invitations: [], stage: 'active' });
    expect(card.isSample).toBe(false);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/__tests__/buyer-kanban-sample.test.ts`
Expected: FAIL — `card.isSample` 가 undefined.

- [ ] **Step 3: buyer-kanban 에 isSample 추가**

`lib/server/buyer-kanban.ts`:
- `BuyerKanbanCard` 타입에 추가(`awardedBidId?` 뒤):

```ts
  isSample: boolean;
```

- `toBuyerCard` 반환 객체에 추가(`awardedBidId: rfp.awardedBidId,` 뒤):

```ts
    isSample: rfp.isSample ?? false,
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/__tests__/buyer-kanban-sample.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: PipelineCard 의 BuyerBody 에 칩 렌더**

`components/board/PipelineCard.tsx` — BuyerBody 의 `<CardHead ... />` 다음 줄에 추가(Chip import 가 없으면 `import { Chip } from '@/components/primitives/Chip';` 추가):

```tsx
        {card.isSample && <Chip label="샘플" color="surface" />}
```

> 시각 전용 조각이라 별도 테스트 없이 Task 3의 카드 타입 테스트 + Task 15 수동 QA 로 커버.

- [ ] **Step 6: Commit**

```bash
git add lib/server/buyer-kanban.ts components/board/PipelineCard.tsx lib/server/__tests__/buyer-kanban-sample.test.ts
git commit -m "feat(onboarding): 샘플 chip on buyer board card"
```

---

## Task 13: 기존 구매사 백필

**Files:**
- Modify: `lib/server/onboarding/sample-rfp.ts` (backfillSampleRfps)
- Create: `scripts/backfill-sample-rfp.ts`
- Test: `lib/server/onboarding/__tests__/sample-rfp.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/server/onboarding/__tests__/sample-rfp.test.ts` 하단에:

```ts
import { backfillSampleRfps } from '../sample-rfp';
import { seedMembership } from '@/lib/server/repositories/drizzle/__tests__/_seed';

describe('backfillSampleRfps', () => {
  it('seeds samples for buyer workspaces without one, idempotently, skipping pg', async () => {
    // buyer with admin
    const bu = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    await seedMembership(db, buyer.id, bu.id, 'admin');
    // pg workspace (should be skipped)
    const { seedPgWorkspace } = await import('@/lib/server/repositories/drizzle/__tests__/_seed');
    const pu = await seedUser(db);
    const pg = await seedPgWorkspace(db);
    await seedMembership(db, pg.id, pu.id, 'admin');

    const first = await backfillSampleRfps(db);
    expect(first.seeded).toBe(1);

    const rfpRows = await db.select().from(rfps).where(eq(rfps.buyerWsId, buyer.id));
    expect(rfpRows).toHaveLength(1);
    expect(await db.select().from(rfps).where(eq(rfps.buyerWsId, pg.id))).toHaveLength(0);

    const second = await backfillSampleRfps(db);
    expect(second.seeded).toBe(0); // 멱등
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/onboarding/__tests__/sample-rfp.test.ts`
Expected: FAIL — `backfillSampleRfps is not a function`.

- [ ] **Step 3: backfillSampleRfps 추가**

`lib/server/onboarding/sample-rfp.ts` 하단에:

```ts
/**
 * sampleSeededAt 가 없는 모든 buyer 워크스페이스에 샘플을 시드한다(멱등). 각 워크스페이스의
 * admin 멤버를 createdBy 로 사용한다. 1회성 백필 스크립트가 호출.
 */
export async function backfillSampleRfps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
): Promise<{ seeded: number }> {
  const buyers = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.type, 'buyer'), isNull(workspaces.sampleSeededAt)));

  let seeded = 0;
  for (const b of buyers as { id: string }[]) {
    const [admin] = await database
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, b.id), eq(workspaceMembers.role, 'admin')))
      .limit(1);
    if (!admin) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await database.transaction((tx: any) =>
      seedSampleRfpInTx(tx, { buyerWsId: b.id, buyerUserId: admin.userId }),
    );
    if (r.seeded) seeded++;
  }
  return { seeded };
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/onboarding/__tests__/sample-rfp.test.ts`
Expected: PASS (전체 onboarding 단위 테스트).

- [ ] **Step 5: 러너 스크립트 작성**

`scripts/backfill-sample-rfp.ts`:

```ts
// 1회성 백필 — 기존 구매사 전부에 샘플 견적 요청을 심는다. 배포 후 수동 실행:
//   PATH=... pnpm tsx scripts/backfill-sample-rfp.ts   (다른 시드 스크립트와 동일 런너)
import { db } from '@/lib/db/client';
import { backfillSampleRfps } from '@/lib/server/onboarding/sample-rfp';

async function main() {
  const { seeded } = await backfillSampleRfps(db);
  console.log(`Seeded sample RFP for ${seeded} buyer workspace(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

> `scripts/seed.ts` 의 실행 방식(`package.json` 의 `db:seed` 스크립트)을 확인하고 동일 런너(tsx 등)로 `package.json` 에 `"backfill:sample": "tsx scripts/backfill-sample-rfp.ts"` 같은 항목을 추가한다(있는 패턴에 맞춰).

- [ ] **Step 6: Commit**

```bash
git add lib/server/onboarding/sample-rfp.ts lib/server/onboarding/__tests__/sample-rfp.test.ts scripts/backfill-sample-rfp.ts package.json
git commit -m "feat(onboarding): backfill sample RFPs for existing buyers"
```

---

## Task 14: 문서 + 전체 헬스 체크

**Files:**
- Modify: `SCREEN_DESIGN.md`

- [ ] **Step 1: SCREEN_DESIGN.md 등록**

`SCREEN_DESIGN.md` 의 `/rfp`(B1 목록) 와 `/rfp/[id]`(상세) 항목에 샘플 온보딩 동작을 1~2줄로 추가:
- 신규/기존 구매사는 `isSample` 샘플 견적 요청 1건을 본다(받은 견적 3건, 보기·비교 전용 샌드박스 — 선정·채팅 비활성). `샘플` 칩으로 구분, 배너/목록 행에서 수동 삭제 가능(삭제 영속).

- [ ] **Step 2: 전체 헬스 (typecheck → lint → test)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm lint
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```

Expected: typecheck 0 errors(메모 `typecheck red: wizard test globals` 의 기존 노이즈는 필터), lint 0, 전체 그린.

> 새 jsdom 컴포넌트 테스트가 RAM 압박을 받으면 메모 `Full suite slow = swap thrash` 참고 — 단일 파일로 나눠 실행.

- [ ] **Step 3: Commit**

```bash
git add SCREEN_DESIGN.md
git commit -m "docs(onboarding): register sample RFP behavior in SCREEN_DESIGN"
```

---

## Deployment notes (실행 시점에 별도 처리)

- **스키마 push (prod)**: 3개 컬럼은 additive(default 안전). 배포 시 `pnpm db:push`(메모 `Drizzle migrations` = push-only). ⚠️ 공유 DB push 가 다른 워크트리 테이블을 드롭할 수 있으니(메모 `drizzle-kit push drops other branches' tables`) prod DATABASE_URL 타겟 확인 후 실행, 또는 surgical `ALTER TABLE ... ADD COLUMN IF NOT EXISTS is_sample/is_demo/sample_seeded_at`.
- **백필 1회 실행**: push 후 `scripts/backfill-sample-rfp.ts` 를 prod DB 대상으로 한 번 실행. 멱등이라 재실행 안전.
- **전역 데모 PG**: `ensureDemoPgs` 는 시드/백필 첫 호출 시 자동 생성된다(별도 시드 단계 불필요).

---

## Self-Review (spec 대조)

- **스키마 3컬럼** → Task 1. **데모 PG** → Task 2. **샘플 시드(RFP+3 차별 견적+invite+allowlist, 멱등, 마커)** → Task 3. **신규 구매사 훅** → Task 4. **삭제(게이트·cascade·영속)** → Task 5/6. **게시판 누수 방어** → Task 7. **샌드박스(선정 비활성)** → Task 8; **채팅 비활성** → Task 10. **샘플 칩**(목록·상세·보드) → Task 11/10/12. **삭제 어포던스**(배너+목록 행) → Task 9/11. **백필** → Task 13. **문서/안전 회귀** → Task 7/14.
- **데모 PG 발견 표면 제외**: `listCanonicalPgWorkspaces` 가 `canonicalPgKey IS NOT NULL` 만 반환 → 데모 PG(canonicalPgKey null)는 **구조적으로 제외됨**(가짜 테스트가 되므로 별도 RED 태스크 없음). 실행 중 다른 PG 목록 쿼리가 있으면 grep 으로 확인하고 필요 시 `eq(workspaces.isDemo, false)` 추가.
- **타입 일관성**: `isSample`(RFP·BuyerKanbanCard), `seedSampleRfpInTx`/`deleteSampleRfpInTx`/`ensureDemoPgs`/`backfillSampleRfps`, `OnboardingService.{seedSampleRfp,deleteSampleRfp}`, `deleteSampleRfpAction({code})` 시그니처가 태스크 전반에서 일치.
- **플레이스홀더 없음**: 모든 코드/명령/기대출력 구체화 완료.
