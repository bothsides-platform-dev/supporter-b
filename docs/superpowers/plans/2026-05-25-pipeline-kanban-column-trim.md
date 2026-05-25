# 파이프라인 칸반 컬럼 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파이프라인 칸반을 스펙의 정규 상태 모델에 맞춰 라이프사이클 컬럼을 줄인다 — 구매사 6→4, PG 6→5.

**Architecture:** 칸반 단계는 순수 도메인 함수(`classifyBuyerRfp`/`classifyPgInvitation`)가 RFP/입찰/초대로부터 **derive** 한다. 컬럼 DB 행은 `defaultColumns`(시드)가 `*_KANBAN_ORDER` 에서 생성한다. 따라서 ORDER/LABEL/분류 함수만 바꾸면 시드가 자동으로 따라온다. **DB 는 처음부터 생성한다고 가정** — 컬럼 트림은 스키마 변화가 아닌 시드 데이터 변화라(`db:generate` = "No schema changes") 별도 데이터 마이그레이션은 두지 않는다(필요 시 DB 재생성). 카드는 `board_column_id`(파이프라인에선 거의 항상 null) → `resolveCardColumn` 의 lifecycleKey 매칭으로 새 컬럼에 자동 분류된다.

**Tech Stack:** TypeScript strict · Vitest · Drizzle ORM + Postgres(postgres-js) / PGlite(테스트) · Next.js App Router.

**핵심 매핑**
- 구매사 6→4: `draft`(작성중) / **`active`(진행중)** ← `sent`+`collecting`+`comparing` / `awarded`(라벨 낙찰→**계약완료**) / `closed`(라벨 종료→**마감**)
- PG 6→5: **`received`(라벨 수신→신규)** ← `received`+`reviewing` / `drafting`(작성중) / `submitted`(제출완료) / `won`(낙찰) / `lost`(실패)

**불변식**
- `KanbanBoard` 컴포넌트는 `kind` 만 받는 공유 컴포넌트 — 변경 없음. `rfp_bids`(입찰) 보드 무관.
- 커스텀 컬럼 / DnD 기능 자체는 범위 밖 — 동작 회귀만 없으면 됨.
- 단계 분류 함수의 **시그니처(파라미터 타입)는 유지** — `loadBoard` 호출부를 건드리지 않기 위해 body 에서 쓰지 않는 인자는 destructure 하지 않는다(미사용 변수 lint 회피).

---

### Task 1: 구매사 파이프라인 6→4

단계 타입을 줄이는 변경은 cross-side 키·드래그 매트릭스가 같은 타입을 참조하므로 **buyer 관련 파일을 한 묶음**으로 바꿔 tsc/스위트를 그린으로 유지한다.

**Files:**
- Modify: `lib/server/buyer-kanban.ts`
- Modify: `lib/server/__tests__/buyer-kanban.test.ts`
- Modify: `lib/server/columns/lifecycle-keys.ts`
- Modify: `lib/server/columns/__tests__/lifecycle-keys.test.ts`
- Modify: `components/home/dragMatrix.ts` (resolveBuyer 만)
- Modify: `components/home/__tests__/dragMatrix.test.ts` (buyer describe)
- Modify: `components/board/__tests__/resolveBoardDrop.test.ts` (buyer 케이스)
- Modify: `lib/server/repositories/drizzle/__tests__/column.test.ts` (buyer 컬럼 리스트 하드코딩)
- Modify: `lib/server/columns/__tests__/seed.test.ts` (buyer 테스트 타이틀)

- [ ] **Step 1: buyer-kanban 테스트를 새 단계로 수정 (RED)**

`lib/server/__tests__/buyer-kanban.test.ts` 의 `describe('classifyBuyerRfp')` 안 기대값을 교체한다. 헬퍼(`makeRfp/makeInv/makeBid`)와 import 는 그대로 둔다. 기존 it 블록들을 아래로 교체:

```ts
  it('draft: status=draft', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'draft' }),
      bids: [],
      invitations: [],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('draft');
  });

  it('active: status=sent (제출 bid 0건이어도 active)', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent' }),
      bids: [makeBid('b1', 'draft')],
      invitations: [makeInv('i1')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('active');
  });

  it('active: status=sent + 제출 bid 있음 + 마감 경과 (수집/비교 구분 없이 active)', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent', deadline: PAST }),
      bids: [makeBid('b1', 'submitted')],
      invitations: [makeInv('i1'), makeInv('i2')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('active');
  });

  it('awarded: status=awarded', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'awarded', awardedBidId: 'b1' }),
      bids: [makeBid('b1', 'submitted')],
      invitations: [makeInv('i1')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('awarded');
  });

  it('closed: status=closed', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'closed' }),
      bids: [],
      invitations: [],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('closed');
  });

  it('closed: status=cancelled', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'cancelled' }),
      bids: [],
      invitations: [],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('closed');
  });
```

(삭제: 기존 `collecting`/`comparing`/`sent`/`withdrawn`/`invitation 0건` 세부 분기 테스트 — 병합으로 무의미해짐.)

- [ ] **Step 2: 테스트 실패 확인 (RED)**

Run: `pnpm test lib/server/__tests__/buyer-kanban.test.ts`
Expected: FAIL — `expected 'sent' to be 'active'` 등 (아직 'sent' 반환).

- [ ] **Step 3: buyer-kanban.ts 구현 (GREEN)**

`lib/server/buyer-kanban.ts` 의 타입/ORDER/LABEL/분류를 교체. `toBuyerCard` 와 `compareBuyerCards` 는 그대로 둔다(병합 단계 'active' 는 compare 의 else 분기 = deadline 오름차순으로 자연 처리).

```ts
export type BuyerKanbanStage = 'draft' | 'active' | 'awarded' | 'closed';

export const BUYER_KANBAN_ORDER: readonly BuyerKanbanStage[] = [
  'draft',
  'active',
  'awarded',
  'closed',
] as const;

export const BUYER_KANBAN_LABEL: Record<BuyerKanbanStage, string> = {
  draft: '작성중',
  active: '진행중',
  awarded: '계약완료',
  closed: '마감',
};
```

그리고 `classifyBuyerRfp` 본문을 교체 (시그니처/파라미터 타입은 유지, body 에선 `rfp` 만 destructure):

```ts
// pure — 단위 테스트 가능. status 만으로 4단계 분류 (스펙 §5 IA: 작성중/진행중/마감/계약완료).
export function classifyBuyerRfp(args: {
  rfp: RFP;
  bids: Bid[];
  invitations: RfpInvitation[];
  now: Date;
}): BuyerKanbanStage {
  const { rfp } = args;
  if (rfp.status === 'awarded') return 'awarded';
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'closed';
  if (rfp.status === 'draft') return 'draft';
  return 'active'; // status === 'sent'
}
```

- [ ] **Step 4: 테스트 통과 확인 (GREEN)**

Run: `pnpm test lib/server/__tests__/buyer-kanban.test.ts`
Expected: PASS

- [ ] **Step 5: lifecycle-keys 테스트 수정 (RED)**

`lib/server/columns/__tests__/lifecycle-keys.test.ts` 의 첫 it 기대 배열에서 buyer side 를 교체하고, 세 번째 it 의 `sent`/`reviewing` 참조를 정리:

```ts
  it('locks exactly the buyer↔PG protocol stages', () => {
    expect([...CROSS_SIDE_LIFECYCLE_KEYS].sort()).toEqual(
      [
        // buyer side
        'active',
        'awarded',
        'closed',
        // pg side
        'received',
        'submitted',
        'won',
        'lost',
      ].sort(),
    );
  });
```

```ts
  it('private skeleton stages are NOT cross-side', () => {
    expect(isCrossSideLifecycleKey('draft')).toBe(false); // buyer-private
    expect(isCrossSideLifecycleKey('drafting')).toBe(false); // pg-private
    expect(isCrossSideLifecycleKey('active')).toBe(true);
    expect(isCrossSideLifecycleKey(null)).toBe(false); // custom / default-landing
  });
```

Run: `pnpm test lib/server/columns/__tests__/lifecycle-keys.test.ts`
Expected: FAIL — cross-side set 아직 `sent/collecting/comparing` 포함.

- [ ] **Step 6: lifecycle-keys.ts 구현 (GREEN)**

`lib/server/columns/lifecycle-keys.ts` 의 `CROSS_SIDE_LIFECYCLE_KEYS` 를 교체하고 주석에서 `reviewing` 을 제거:

```ts
export const CROSS_SIDE_LIFECYCLE_KEYS: ReadonlySet<string> = new Set([
  // buyer side
  'active',
  'awarded',
  'closed',
  // pg side
  'received',
  'submitted',
  'won',
  'lost',
]);
```

상단 주석의 "The remaining lifecycle stages (draft/drafting/reviewing)..." 문장을 "(draft/drafting)" 으로 수정.

Run: `pnpm test lib/server/columns/__tests__/lifecycle-keys.test.ts`
Expected: PASS

- [ ] **Step 7: buyer 드래그 매트릭스 테스트 수정 (RED)**

`components/home/__tests__/dragMatrix.test.ts` 의 `describe('resolveDrag — buyer')` 블록을 교체:

```ts
describe('resolveDrag — buyer', () => {
  it('draft → active: send-rfp', () => {
    const a = resolveDrag({ role: 'buyer', from: 'draft', to: 'active', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'send-rfp', rfpId: 'P-2605-0001', title: 'RFP 1' });
  });

  it('active → awarded: navigate-rfp-detail', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'awarded', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'navigate-rfp-detail', rfpId: 'P-2605-0001' });
  });

  it('active → closed: cancel-rfp', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'closed', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'cancel-rfp', rfpId: 'P-2605-0001', title: 'RFP 1' });
  });

  it('draft → closed: cancel-rfp', () => {
    const a = resolveDrag({ role: 'buyer', from: 'draft', to: 'closed', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'cancel-rfp', rfpId: 'P-2605-0001', title: 'RFP 1' });
  });

  it('invalid: draft → awarded (응답 단계 거치지 않음)', () => {
    const a = resolveDrag({ role: 'buyer', from: 'draft', to: 'awarded', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toBeNull();
  });

  it('invalid: active → draft (역방향)', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'draft', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toBeNull();
  });

  it('invalid: same column', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'active', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toBeNull();
  });
});
```

Run: `pnpm test components/home/__tests__/dragMatrix.test.ts`
Expected: FAIL (buyer 케이스).

- [ ] **Step 8: dragMatrix.ts resolveBuyer 구현 (GREEN)**

`components/home/dragMatrix.ts` 의 `resolveBuyer` 함수만 교체 (`resolvePg`/타입/주석은 Task 2 에서):

```ts
function resolveBuyer(i: BuyerInput): DragAction | null {
  if (i.from === i.to) return null;

  // draft → active: 발송
  if (i.from === 'draft' && i.to === 'active') {
    return { kind: 'send-rfp', rfpId: i.rfpId, title: i.title };
  }

  // active → awarded: 낙찰은 PG 선택 필요 → RFP 상세(BidBoard)로 이동
  if (i.from === 'active' && i.to === 'awarded') {
    return { kind: 'navigate-rfp-detail', rfpId: i.rfpId };
  }

  // {draft, active} → closed: 취소
  if (i.to === 'closed' && (i.from === 'draft' || i.from === 'active')) {
    return { kind: 'cancel-rfp', rfpId: i.rfpId, title: i.title };
  }

  return null;
}
```

Run: `pnpm test components/home/__tests__/dragMatrix.test.ts`
Expected: PASS (pg describe 도 여전히 통과 — pg 미변경).

- [ ] **Step 9: resolveBoardDrop 테스트 buyer 케이스 수정 (RED→GREEN, 구현 변경 없음)**

`components/board/__tests__/resolveBoardDrop.test.ts` 의 buyer lifecycle 케이스 2개를 교체 (`resolveBoardDrop.ts` 자체는 변경 없음 — payload.stage/lifecycleKey 를 그대로 통과시키므로):

```ts
  it('rfp draft → active lifecycle column → send-rfp action', () => {
    const target = col({ id: 'active', lifecycleKey: 'active' });
    expect(
      resolveBoardDrop({
        cardType: 'rfp',
        toColumn: target,
        payload: { stage: 'draft', rfpId: 'P-2605-0001', title: 'RFP' },
      }),
    ).toEqual({ kind: 'lifecycle', action: { kind: 'send-rfp', rfpId: 'P-2605-0001', title: 'RFP' } });
  });

  it('rfp draft → awarded (no valid transition) → reject', () => {
    const target = col({ id: 'awarded', lifecycleKey: 'awarded' });
    expect(
      resolveBoardDrop({
        cardType: 'rfp',
        toColumn: target,
        payload: { stage: 'draft', rfpId: 'P-2605-0001', title: 'RFP' },
      }),
    ).toEqual({ kind: 'reject' });
  });

  it('rfp active → closed lifecycle column → cancel-rfp action', () => {
    const target = col({ id: 'closed', lifecycleKey: 'closed' });
    expect(
      resolveBoardDrop({
        cardType: 'rfp',
        toColumn: target,
        payload: { stage: 'active', rfpId: 'P-2605-0009', title: 'RFP9' },
      }),
    ).toEqual({ kind: 'lifecycle', action: { kind: 'cancel-rfp', rfpId: 'P-2605-0009', title: 'RFP9' } });
  });
```

Run: `pnpm test components/board/__tests__/resolveBoardDrop.test.ts`
Expected: PASS (invitation/custom/landing/bid 케이스 무변경).

- [ ] **Step 10: column 리포 테스트 + seed 테스트 타이틀 정리 (GREEN)**

`lib/server/repositories/drizzle/__tests__/column.test.ts` 의 하드코딩된 buyer 리스트(약 38~45줄)를 교체:

```ts
    expect(pipeline.map((c) => c.lifecycleKey)).toEqual([
      'draft',
      'active',
      'awarded',
      'closed',
    ]);
```

`lib/server/columns/__tests__/seed.test.ts` 의 buyer it 타이틀을 정확히 수정 (단언은 동적이라 그대로):

```ts
  it('buyer: 4 pipeline lifecycle columns + 3 rfp_bids columns', () => {
```

Run: `pnpm test lib/server/repositories/drizzle/__tests__/column.test.ts lib/server/columns/__tests__/seed.test.ts`
Expected: PASS

- [ ] **Step 11: 커밋**

```bash
git add lib/server/buyer-kanban.ts lib/server/__tests__/buyer-kanban.test.ts \
  lib/server/columns/lifecycle-keys.ts lib/server/columns/__tests__/lifecycle-keys.test.ts \
  components/home/dragMatrix.ts components/home/__tests__/dragMatrix.test.ts \
  components/board/__tests__/resolveBoardDrop.test.ts \
  lib/server/repositories/drizzle/__tests__/column.test.ts lib/server/columns/__tests__/seed.test.ts
git commit -m "refactor(kanban): 구매사 파이프라인 컬럼 6→4 (발송·응답수집·비교협상중→진행중)"
```

---

### Task 2: PG 파이프라인 6→5

PG 단계에서 `reviewing`(검토중) 만 제거 — `received`(신규) 로 흡수. 낙찰/실패 분리는 유지(결정 사항). cross-side 키는 PG 쪽 변동 없음(reviewing 은 원래 cross-side 아님).

**Files:**
- Modify: `lib/server/pg-kanban.ts`
- Modify: `lib/server/__tests__/pg-kanban.test.ts`
- Modify: `components/home/dragMatrix.ts` (resolvePg 만)
- Modify: `components/home/__tests__/dragMatrix.test.ts` (pg describe)
- Modify: `lib/server/columns/__tests__/seed.test.ts` (pg 테스트 타이틀)

- [ ] **Step 1: pg-kanban 테스트 수정 (RED)**

`lib/server/__tests__/pg-kanban.test.ts` 의 `reviewing` 테스트를 `received` 로 교체 (나머지 it 은 그대로):

```ts
  it('received: invitation=opened + no bid (열람도 신규로 — 검토중 단계 제거)', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: undefined,
      rfp: makeRfp(),
    });
    expect(stage).toBe('received');
  });
```

Run: `pnpm test lib/server/__tests__/pg-kanban.test.ts`
Expected: FAIL — `expected 'reviewing' to be 'received'`.

- [ ] **Step 2: pg-kanban.ts 구현 (GREEN)**

`lib/server/pg-kanban.ts` 타입/ORDER/LABEL/분류를 교체. `toPgCard`/`GRADE_LABEL`/`comparePgCards` 는 그대로.

```ts
export type PgKanbanStage = 'received' | 'drafting' | 'submitted' | 'won' | 'lost';

export const PG_KANBAN_ORDER: readonly PgKanbanStage[] = [
  'received',
  'drafting',
  'submitted',
  'won',
  'lost',
] as const;

export const PG_KANBAN_LABEL: Record<PgKanbanStage, string> = {
  received: '신규',
  drafting: '작성중',
  submitted: '제출완료',
  won: '낙찰',
  lost: '실패',
};
```

`classifyPgInvitation` 본문 교체 (시그니처 유지, body 에선 `invitation` 미사용 → destructure 제외):

```ts
// pure — 단위 테스트 가능. 검토중(reviewing) 제거 — 열람 여부와 무관하게 신규(received).
export function classifyPgInvitation(args: {
  invitation: RfpInvitation;
  bid?: Bid;
  rfp: RFP;
}): PgKanbanStage {
  const { bid, rfp } = args;

  // 결과 단계는 bid 단계보다 우선.
  if (rfp.status === 'awarded') {
    return bid && rfp.awardedBidId === bid.id ? 'won' : 'lost';
  }
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'lost';

  if (bid?.status === 'withdrawn') return 'lost';
  if (bid?.status === 'submitted') return 'submitted';
  if (bid?.status === 'draft') return 'drafting';

  // bid 없음 — sent/opened 모두 신규(received).
  return 'received';
}
```

Run: `pnpm test lib/server/__tests__/pg-kanban.test.ts`
Expected: PASS

- [ ] **Step 3: pg 드래그 매트릭스 테스트 수정 (RED)**

`components/home/__tests__/dragMatrix.test.ts` 의 `describe('resolveDrag — pg')` 에서 `reviewing → drafting` 테스트를 삭제하고 나머지는 유지. (받은 received→drafting / drafting→submitted / submitted→lost / invalid 들은 그대로.)

Run: `pnpm test components/home/__tests__/dragMatrix.test.ts`
Expected: 통과(런타임 문자열 비교라 깨지진 않으나, tsc 정합을 위해 다음 스텝 진행).

- [ ] **Step 4: dragMatrix.ts resolvePg 구현 (GREEN)**

`components/home/dragMatrix.ts` 의 `resolvePg` 에서 `reviewing` 분기를 제거:

```ts
function resolvePg(i: PgInput): DragAction | null {
  if (i.from === i.to) return null;

  // 작성 단계로 이동 — v0 는 form 이 inbox 페이지에 있어 navigate.
  if (i.from === 'received' && i.to === 'drafting') {
    return { kind: 'navigate-inbox', rfpId: i.rfpId };
  }

  // drafting → submitted: 폼 채워서 제출해야 함 — navigate.
  if (i.from === 'drafting' && i.to === 'submitted') {
    return { kind: 'navigate-inbox', rfpId: i.rfpId };
  }

  // submitted → lost: 철회.
  if (i.from === 'submitted' && i.to === 'lost' && i.bidId) {
    return { kind: 'withdraw-bid', bidId: i.bidId, rfpId: i.rfpId, title: i.title };
  }

  return null;
}
```

Run: `pnpm test components/home/__tests__/dragMatrix.test.ts`
Expected: PASS

- [ ] **Step 5: seed pg 타이틀 수정**

`lib/server/columns/__tests__/seed.test.ts` 의 pg it 타이틀:

```ts
  it('pg: 5 pipeline lifecycle columns, no rfp_bids board', () => {
```

Run: `pnpm test lib/server/columns/__tests__/seed.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/server/pg-kanban.ts lib/server/__tests__/pg-kanban.test.ts \
  components/home/dragMatrix.ts components/home/__tests__/dragMatrix.test.ts \
  lib/server/columns/__tests__/seed.test.ts
git commit -m "refactor(kanban): PG 파이프라인 컬럼 6→5 (검토중 제거, 낙찰/실패 유지)"
```

---

### Task 3: 기존 워크스페이스 reconcile 마이그레이션 (TDD) — ❌ SUPERSEDED / 제거됨

> **이 태스크는 폐기됨 (2026-05-25 결정).** DB 를 처음부터 생성한다고 가정 — 컬럼
> 트림은 스키마 변화가 아닌 **시드 데이터** 변화이고(`pnpm db:generate` = "No schema
> changes, nothing to migrate"), 신규 워크스페이스는 `defaultColumns`(buyer 4 / pg 5)
> 로 시드된다. 별도 데이터 마이그레이션을 두지 않으며 `reconcile-pipeline-trim.ts` /
> 그 테스트 / `scripts/migrate-pipeline-columns-trim.ts` 는 **생성하지 않는다**(이미
> 만들었다면 삭제). 아래 원본 내용은 기록용으로만 남김.

신규 워크스페이스는 시드로 새 컬럼을 받지만, 기존 워크스페이스는 레거시 6컬럼이 DB 에 남아 있다. 일회성·idempotent reconcile 로 정리한다. 로직을 테스트 가능한 순수 함수로 분리하고 스크립트는 얇게.

**Files:**
- Create: `lib/server/columns/reconcile-pipeline-trim.ts`
- Create: `lib/server/columns/__tests__/reconcile-pipeline-trim.test.ts`
- Create: `scripts/migrate-pipeline-columns-trim.ts`

- [ ] **Step 1: reconcile 테스트 작성 (RED)**

`lib/server/columns/__tests__/reconcile-pipeline-trim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleColumnRepository } from '@/lib/server/repositories/drizzle/column';
import { reconcilePipelineColumnTrim } from '@/lib/server/columns/reconcile-pipeline-trim';
import { seedBuyerWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { BoardColumn } from '@/lib/types/column';

// 레거시 키(구매사 6 + PG 6) — 단위 테스트에서는 한 워크스페이스에 공존시켜 변환만 검증.
const LEGACY = [
  'draft', 'sent', 'collecting', 'comparing', 'awarded', 'closed',
  'received', 'reviewing', 'drafting', 'submitted', 'won', 'lost',
] as const;

function legacyCol(wsId: string, key: string, pos: string): BoardColumn {
  return { id: randomUUID(), workspaceId: wsId, kind: 'pipeline', title: key, position: pos, color: null, lifecycleKey: key };
}

function seedLegacy(wsId: string): BoardColumn[] {
  return LEGACY.map((k, i) => legacyCol(wsId, k, `a${i}`));
}

describe('reconcilePipelineColumnTrim', () => {
  it('레거시 파이프라인 컬럼을 트림된 집합으로 정리', async () => {
    const db = await createPgliteDb();
    const ws = await seedBuyerWorkspace(db);
    const repo = new DrizzleColumnRepository(db);
    await repo.createMany(seedLegacy(ws.id));

    await reconcilePipelineColumnTrim(db);

    const after = await repo.listByBoard(ws.id, 'pipeline');
    const byKey = new Map(after.map((c) => [c.lifecycleKey, c.title]));
    // 병합/삭제
    expect(byKey.has('sent')).toBe(false);
    expect(byKey.has('collecting')).toBe(false);
    expect(byKey.has('comparing')).toBe(false);
    expect(byKey.has('reviewing')).toBe(false);
    // 존재 + 라벨
    expect(byKey.get('active')).toBe('진행중');
    expect(byKey.get('awarded')).toBe('계약완료');
    expect(byKey.get('closed')).toBe('마감');
    expect(byKey.get('received')).toBe('신규');
    expect(byKey.get('draft')).toBe('draft'); // 미변경
  });

  it('idempotent — 두 번째 실행은 no-op', async () => {
    const db = await createPgliteDb();
    const ws = await seedBuyerWorkspace(db);
    const repo = new DrizzleColumnRepository(db);
    await repo.createMany(seedLegacy(ws.id));

    await reconcilePipelineColumnTrim(db);
    const first = (await repo.listByBoard(ws.id, 'pipeline')).map((c) => c.lifecycleKey).sort();
    await reconcilePipelineColumnTrim(db);
    const second = (await repo.listByBoard(ws.id, 'pipeline')).map((c) => c.lifecycleKey).sort();

    expect(second).toEqual(first);
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `pnpm test lib/server/columns/__tests__/reconcile-pipeline-trim.test.ts`
Expected: FAIL — `Cannot find module '.../reconcile-pipeline-trim'`.

- [ ] **Step 3: reconcile 함수 구현 (GREEN)**

`lib/server/columns/reconcile-pipeline-trim.ts`:

```ts
// 일회성·idempotent: 기존 워크스페이스의 레거시 6단계 파이프라인 컬럼을 트림된
// 집합으로 정리한다. (신규 워크스페이스는 defaultColumns 시드가 이미 새 집합 생성.)
//   buyer: sent → active(진행중); collecting·comparing 컬럼 삭제; 낙찰→계약완료; 종료→마감
//   pg:    reviewing 컬럼 삭제; 수신→신규
// 파이프라인 카드의 board_column_id 는 거의 항상 null 이고, 컬럼 삭제 시 FK
// ON DELETE SET NULL 로 null 화되어 lifecycleKey 기준 자동 재분류된다.
// 부분 unique index (workspace_id, kind, lifecycle_key) WHERE lifecycle_key IS
// NOT NULL 보존: sent→active 는 워크스페이스당 단 하나의 'active' 만 만든다.
import { and, eq, inArray } from 'drizzle-orm';
import { columns } from '@/lib/db/schema';
import type { Tx } from '@/lib/server/repositories/types';

export async function reconcilePipelineColumnTrim(db: Tx): Promise<void> {
  // buyer: 발송 컬럼을 진행중으로 전환 (기존 'sent' 행 rename)
  await db
    .update(columns)
    .set({ lifecycleKey: 'active', title: '진행중' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'sent')));
  // buyer: 응답수집·비교협상중 컬럼 삭제 (카드는 active 로 재분류)
  await db
    .delete(columns)
    .where(and(eq(columns.kind, 'pipeline'), inArray(columns.lifecycleKey, ['collecting', 'comparing'])));
  // buyer: 라벨 정렬
  await db
    .update(columns)
    .set({ title: '계약완료' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'awarded')));
  await db
    .update(columns)
    .set({ title: '마감' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'closed')));
  // pg: 검토중 컬럼 삭제 (카드는 received 로 재분류), 수신→신규 라벨
  await db
    .delete(columns)
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'reviewing')));
  await db
    .update(columns)
    .set({ title: '신규' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'received')));
}
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `pnpm test lib/server/columns/__tests__/reconcile-pipeline-trim.test.ts`
Expected: PASS (두 테스트 모두)

- [ ] **Step 5: 마이그레이션 스크립트 작성**

`scripts/migrate-pipeline-columns-trim.ts` (기존 `scripts/backfill-kanban-columns.ts` 패턴):

```ts
/**
 * scripts/migrate-pipeline-columns-trim.ts — one-shot, idempotent.
 *
 * 기존 워크스페이스의 레거시 6단계 파이프라인 컬럼을 트림된 집합(구매사 4, PG 5)으로
 * 정리. 신규 워크스페이스는 시드(defaultColumns)가 이미 새 집합을 생성한다.
 * Run: tsx scripts/migrate-pipeline-columns-trim.ts
 */
import 'dotenv/config';

import { db } from '@/lib/db/client';
import { reconcilePipelineColumnTrim } from '@/lib/server/columns/reconcile-pipeline-trim';

async function main(): Promise<void> {
  await reconcilePipelineColumnTrim(db);
  console.log('migrate-pipeline-columns-trim: done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 6: 커밋**

```bash
git add lib/server/columns/reconcile-pipeline-trim.ts \
  lib/server/columns/__tests__/reconcile-pipeline-trim.test.ts \
  scripts/migrate-pipeline-columns-trim.ts
git commit -m "feat(kanban): 기존 워크스페이스 파이프라인 컬럼 트림 reconcile 스크립트 (TDD)"
```

---

### Task 4: 문서 정합 (스펙 drift 방지)

CLAUDE.md 규칙: 스펙이 정본. PG 칸반이 5컬럼(낙찰/실패 분리)으로 표 탭(4)과 달라지는 것은 **의도된 차이**임을 기록한다.

**Files:**
- Modify: `PG_RFP_SPEC.md` (B2/P2 IA 행 — 약 182·194줄)
- Modify: `SCREEN_DESIGN.md` (B2/P2 — 약 62·74줄)

- [ ] **Step 1: PG_RFP_SPEC.md 에 칸반 컬럼 주석 추가**

§5 IA 표의 B2 행 끝(또는 표 바로 아래)에 한 줄 추가:

```markdown
> 칸반 뷰 컬럼: 구매사 `작성중 / 진행중 / 계약완료 / 마감`(4) — 표 탭과 동일. PG `신규 / 작성중 / 제출완료 / 낙찰 / 실패`(5) — 표 탭의 `마감`을 보드에서는 영업 관점상 `낙찰`/`실패`로 분리(의도된 refinement).
```

- [ ] **Step 2: SCREEN_DESIGN.md 에 동일 주석 추가**

B2(62줄)·P2(74줄) 표 아래(또는 §0 IA 블록 끝)에 다음 한 줄을 추가:

```markdown
> 칸반 뷰 컬럼: 구매사 `작성중 / 진행중 / 계약완료 / 마감`(4, 표 탭과 동일), PG `신규 / 작성중 / 제출완료 / 낙찰 / 실패`(5 — 표 탭 `마감`을 보드에서 `낙찰`/`실패`로 분리).
```

- [ ] **Step 3: 커밋**

```bash
git add PG_RFP_SPEC.md SCREEN_DESIGN.md
git commit -m "docs(kanban): 파이프라인 칸반 컬럼(구매사 4/PG 5) IA 주석 — PG 낙찰·실패 분리 명시"
```

---

### Task 5: 헬스 게이트 · 스키마 확인 · 검증

**Files:** (코드 변경 없음 — 검증/실행)

- [ ] **Step 1: 타입체크**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음. (실패 시: dragMatrix.ts 에 남은 레거시 stage 문자열 비교가 원인 — Task 1/2 에서 모두 교체됐는지 확인.)

- [ ] **Step 2: 린트** (RTK 오탐 회피 — eslint 직접 실행)

Run: `./node_modules/.bin/eslint .`
Expected: 에러 없음.

- [ ] **Step 3: 전체 유닛 스위트**

Run: `pnpm test`
Expected: 전부 PASS.

- [ ] **Step 4: e2e 라벨 셀렉터 점검**

칸반 컬럼 라벨이 바뀌었으므로(`발송`·`응답수집`·`비교·협상중`→`진행중`, `종료`→`마감`, 구매사 `낙찰`→`계약완료`, `수신`→`신규`, `검토중` 삭제) e2e 가 컬럼을 라벨로 찾는지 확인.

Run: `rtk proxy grep -rnE "발송|응답수집|비교·협상|종료|검토중|수신" e2e`
바뀐 칸반 컬럼 라벨을 셀렉터로 쓰는 곳이 있으면 새 라벨로 교체. (단, RFP "발송" 액션·이메일 문맥은 무관 — 칸반 컬럼 헤더만 대상.)

Run: `pnpm e2e`
Expected: PASS (또는 라벨 수정 후 PASS).

- [ ] **Step 5: 스키마 확인 (별도 데이터 마이그레이션 없음 — from-scratch)**

컬럼 트림은 시드 데이터 변화이지 스키마 변화가 아니다. 스키마 파일이 최신인지 확인:

Run: `pnpm db:generate`
Expected: `No schema changes, nothing to migrate`.

> DB 는 처음부터 생성한다고 가정 — `drizzle/0000_*.sql` 로 스키마 생성 후 워크스페이스
> 생성 시 `defaultColumns`(buyer 4 / pg 5)가 시드. 기존 DB 에 반영하려면 재생성(별도
> reconcile/마이그레이션 스크립트 없음).

- [ ] **Step 6: 수동 시각 확인 (회귀 테스트 아님)**

`pnpm dev` 후 구매사 `/rfp` → 칸반 토글 → 4컬럼(작성중/진행중/계약완료/마감) 확인. PG `/inbox` → 칸반 → 5컬럼(신규/작성중/제출완료/낙찰/실패) 확인. 카드가 올바른 컬럼에 표시되고 드래그(발송/취소/철회)가 동작하는지 확인.

- [ ] **Step 7: 최종 커밋(필요 시)**

e2e 라벨 수정 등 변경이 있었다면 (변경된 e2e 파일만 명시적으로 add — 무관한 작업트리 변경 `components/shell/WorkspaceSwitcher.tsx` 등을 쓸어담지 않도록 `git add -A` 금지):

```bash
git add e2e/
git commit -m "test(kanban): e2e 칸반 컬럼 라벨 셀렉터 정합"
```
