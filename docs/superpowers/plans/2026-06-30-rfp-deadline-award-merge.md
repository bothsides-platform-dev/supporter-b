# 마감·선정완료 통합 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** buyer 화면에서 `마감`(closed)·`선정완료`(awarded)를 하나의 '마감' 종결 버킷으로 통합 표시하고, 결과는 칩(선정완료/미선정/취소)으로 구분한다.

**Architecture:** 순수 프레젠테이션 변경. `RfpStatus` enum·DB 스키마·서버 로직 불변(DDL 0). 칩 라벨 SSOT(`RFP_STATUS_CHIP`)를 재라벨하고, buyer 칸반 lifecycle 스테이지를 3→2로 병합하며, 잉여 '선정 완료' 컬럼은 1회성 마이그레이션 스크립트로 제거(카드는 `ON DELETE SET NULL`+`resolveCardColumn`이 자동 재배치). 필터·사이드바·홈 KPI에서도 awarded를 마감으로 폴드.

**Tech Stack:** Next.js App Router, TypeScript strict, Vitest(+jsdom/PGlite), Drizzle ORM, Tailwind v4, `@base-ui/react` Chip.

## Global Constraints

- **표시(display) 전용 변경** — `RfpStatus` enum(`draft|sent|closed|cancelled|awarded`)·DB 컬럼·서버 액션/서비스 로직은 **불변**.
- **DDL 0.** 새 마이그레이션/컬럼/enum 없음. 유일한 데이터 작업은 잉여 칸반 컬럼 1개를 지우는 1회성 스크립트.
- **결과 칩 용어(확정):** awarded → `선정완료`(color `tertiary`), closed → `미선정`(color `surface`), cancelled → `취소`(color `error`). 비종결: draft → `임시저장`(surface), sent → `요청 보냄`(warning).
- **봉인 경계:** PG 화면은 별도 `pgRequestChip()` 사용 — 절대 건드리지 않는다(`lib/rfp-status.ts:33-34` "통일 금지" 보존).
- **TDD 필수:** 각 코드 변경은 실패 테스트(RED)를 `pnpm test <path>`로 직접 확인한 뒤 최소 구현(GREEN). 단일 파일로 빠르게 RED/GREEN 확인.
- **커밋:** 태스크마다 1커밋. pre-commit 훅이 전체 `pnpm lint`를 돌려 느리다 — 커밋 시 Bash `timeout`을 600000ms로 올린다. 마크다운만 만지는 경우가 아니면 `--no-verify` 금지(코드는 lint 통과 필요).
- **Linear 디자인:** 상태는 `Chip` 컴포넌트로만 표기(대괄호 텍스트 금지). pill 금지.

## File Structure

**Part 1 — 칩 라벨 SSOT**
- Modify: `lib/rfp-status.ts` — `RFP_STATUS_CHIP` closed/awarded 라벨.
- Test: `lib/__tests__/rfp-status.test.ts`.

**Part 2 — 칸반 병합**
- Modify: `lib/server/buyer-kanban.ts` — 스테이지 union·ORDER·LABEL·classify·compare·`BuyerKanbanCard.status`·`toBuyerCard`.
- Modify: `components/board/PipelineCard.tsx` — 결과 칩 렌더.
- Modify: `components/board/PipelineBoard.tsx` — 종결컬럼 더보기 링크.
- Modify: `components/home/dragMatrix.ts` — buyer 드롭 매핑·`DragAction` union.
- Modify: `components/home/KanbanActionDialog.tsx` — cancel-rfp 제거.
- Modify: `lib/server/columns/lifecycle-keys.ts` — CROSS_SIDE 집합.
- Create: `scripts/remove-awarded-kanban-columns.ts` — 마이그레이션.
- Test: `lib/server/__tests__/buyer-kanban.test.ts`, `components/board/__tests__/{resolveBoardDrop,useBoardDnd}.test.tsx`, `components/home/__tests__/{dragMatrix,KanbanActionDialog}.test.tsx`, `lib/server/columns/__tests__/lifecycle-keys.test.ts`, `lib/server/actions/workspace/__tests__/createWorkspace.test.ts`, **Create** `components/board/__tests__/PipelineCard.test.tsx`.

**Part 3 — 필터·사이드바·홈 KPI**
- Modify: `lib/server/status-filter.ts` — `RFP_PARAM_MAP`.
- Modify: `app/(app)/rfp/page.tsx` — `STATUS_OPTIONS`.
- Modify: `lib/nav/nav-config.ts` — `STATUS_LABELS['/rfp']`.
- Modify: `lib/server/dashboard/buildDashboard.ts` — '선정 완료' KPI href.
- Test: `lib/server/__tests__/status-filter.test.ts`.

---

## Task 1: 칩 라벨 재라벨 (Part 1)

**Files:**
- Modify: `lib/rfp-status.ts:11-17`
- Test: `lib/__tests__/rfp-status.test.ts:8-29`

**Interfaces:**
- Produces: `RFP_STATUS_CHIP.closed = { label: '미선정', color: 'surface' }`, `RFP_STATUS_CHIP.awarded = { label: '선정완료', color: 'tertiary' }`. Task 3의 PipelineCard가 `RFP_STATUS_CHIP[card.status]`로 소비.

- [ ] **Step 1: 테스트 기대값 갱신 (RED)**

`lib/__tests__/rfp-status.test.ts`의 두 단언을 수정한다.

`RFP_STATUS_CHIP` 블록(라인 10-16) 안:
```ts
      closed: { label: '미선정', color: 'surface' },
      awarded: { label: '선정완료', color: 'tertiary' },
```

`rfpStatusChip` 블록(라인 23):
```ts
    expect(rfpStatusChip('awarded')).toEqual({ label: '선정완료', color: 'tertiary' });
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/__tests__/rfp-status.test.ts`
Expected: FAIL — received `'마감'`/`'선정 완료'` ≠ expected `'미선정'`/`'선정완료'`.

- [ ] **Step 3: 구현 (GREEN)**

`lib/rfp-status.ts:14-15`:
```ts
  closed: { label: '미선정', color: 'surface' },
  awarded: { label: '선정완료', color: 'tertiary' },
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/__tests__/rfp-status.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/rfp-status.ts lib/__tests__/rfp-status.test.ts
git commit -m "feat(rfp): 상태 칩 재라벨 — closed→미선정, awarded→선정완료"
```

---

## Task 2: BuyerKanbanCard.status 필드 추가 (additive)

카드가 결과 칩을 그리려면 stage 병합 후에도 종결 결과를 구분할 raw status가 필요하다. 이 태스크는 **순수 additive**(union 병합 전) — typecheck green 유지.

**Files:**
- Modify: `lib/server/buyer-kanban.ts:8,26-39,51-74`
- Test: `lib/server/__tests__/buyer-kanban.test.ts:43-138`

**Interfaces:**
- Produces: `BuyerKanbanCard.status: RfpStatus` (= `rfp.status`). Task 3의 PipelineCard·compareBuyerCards가 소비.

- [ ] **Step 1: toBuyerCard status 테스트 추가 (RED)**

`lib/server/__tests__/buyer-kanban.test.ts`의 `describe('toBuyerCard', …)` 안에 추가:
```ts
  it('card.status = rfp.status (결과 칩 구분용)', () => {
    const card = toBuyerCard({
      rfp: makeRfp({ status: 'awarded', awardedBidId: 'b1' }),
      bids: [],
      invitations: [],
      stage: 'awarded',
    });
    expect(card.status).toBe('awarded');
  });
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/__tests__/buyer-kanban.test.ts`
Expected: FAIL — `card.status` is `undefined`.

- [ ] **Step 3: 타입·구현 추가 (GREEN)**

`lib/server/buyer-kanban.ts` 라인 8 import 에 `RfpStatus` 추가:
```ts
import type { RFP, RfpStatus } from '@/lib/types/rfp';
```

`BuyerKanbanCard` 타입(라인 26-39)에 필드 추가 — `isCancelled` 위:
```ts
  /** raw RFP status — 마감 컬럼 안 결과 칩(선정완료/미선정/취소) 도출용. */
  status: RfpStatus;
```

`toBuyerCard` 반환 객체(라인 60-73)에 추가 — `isCancelled` 줄 옆:
```ts
    status: rfp.status,
```

- [ ] **Step 4: 기존 픽스처에 status 추가 (typecheck 보존)**

`lib/server/__tests__/buyer-kanban.test.ts`의 `compareBuyerCards` describe 안 3개 `BuyerKanbanCard` 리터럴에 `status`를 추가한다(필수 필드).

`older`(stage 'awarded', 라인 84-95) → `status: 'awarded',` 추가.
`a`(stage 'closed', isCancelled:true, 라인 106-117) → `status: 'cancelled',` 추가.
`soon`(stage 'active', 라인 123-134) → `status: 'sent',` 추가.

(`newer`/`b`/`later`는 스프레드 `...older` 등으로 status 를 상속하므로 추가 불필요.)

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test lib/server/__tests__/buyer-kanban.test.ts`
Expected: PASS.

Run: `pnpm tsc --noEmit`
Expected: 에러 없음(이 태스크는 additive — union 미변경).

- [ ] **Step 6: 커밋**

```bash
git add lib/server/buyer-kanban.ts lib/server/__tests__/buyer-kanban.test.ts
git commit -m "feat(kanban): BuyerKanbanCard.status 추가 (결과 칩 도출용)"
```

---

## Task 3: 칸반 스테이지 병합 + 결과 칩 + DnD 재배선

**원자적 typecheck-coupled 변경.** `BuyerKanbanStage` union 에서 `'awarded'`를 빼면 PipelineCard·dragMatrix 가 동시에 깨지므로 한 태스크로 묶어 끝에 typecheck green. cancel-rfp 드래그 경로(이 병합으로 고아가 됨)도 함께 제거.

**Files:**
- Modify: `lib/server/buyer-kanban.ts:12-24,44-49,77-85`
- Modify: `components/board/PipelineCard.tsx:3,53-65`
- Modify: `components/home/dragMatrix.ts:8-12,38-52`
- Modify: `components/home/KanbanActionDialog.tsx:6,16-34,52-62`
- Modify: `components/board/PipelineBoard.tsx:35-41`
- Modify: `lib/server/columns/lifecycle-keys.ts:8-18`
- Test: `lib/server/__tests__/buyer-kanban.test.ts`, `components/home/__tests__/dragMatrix.test.ts`, `components/board/__tests__/resolveBoardDrop.test.ts`, `components/board/__tests__/useBoardDnd.test.tsx`, `components/home/__tests__/KanbanActionDialog.test.tsx`, `lib/server/columns/__tests__/lifecycle-keys.test.ts`
- Create: `components/board/__tests__/PipelineCard.test.tsx`

**Interfaces:**
- Consumes: `RFP_STATUS_CHIP` (Task 1), `BuyerKanbanCard.status` (Task 2).
- Produces: `BuyerKanbanStage = 'active' | 'closed'`; `classifyBuyerRfp(awarded) → 'closed'`; `DragAction` union without `'cancel-rfp'`; buyer 드롭 `active→closed = navigate-rfp-detail`.

- [ ] **Step 1: buyer-kanban 스테이지 테스트 갱신 (RED)**

`lib/server/__tests__/buyer-kanban.test.ts`:
- `classifyBuyerRfp` describe(라인 30-32) "awarded: status=awarded" 교체:
```ts
  it('awarded → closed (선정완료도 마감 버킷)', () => {
    expect(classifyBuyerRfp({ rfp: makeRfp({ status: 'awarded', awardedBidId: 'b1' }) })).toBe('closed');
  });
```
- `compareBuyerCards` describe: `older`/`newer` 픽스처의 `stage: 'awarded'` → `stage: 'closed'`로 변경(2곳, 라인 88·기타 `...older` 상속). describe 제목 "awarded 컬럼: …" → "결과(마감) 컬럼: 선정완료 카드 updatedAt 최신 우선" 으로 수정.

- [ ] **Step 2: RED 확인 (vitest)**

Run: `pnpm test lib/server/__tests__/buyer-kanban.test.ts`
Expected: FAIL — `classifyBuyerRfp` 반환 `'awarded'` ≠ `'closed'`.

- [ ] **Step 3: buyer-kanban.ts 병합 (GREEN)**

`lib/server/buyer-kanban.ts`:

라인 12-24 — union/ORDER/LABEL:
```ts
export type BuyerKanbanStage = 'active' | 'closed';

export const BUYER_KANBAN_ORDER: readonly BuyerKanbanStage[] = [
  'active',
  'closed',
] as const;

export const BUYER_KANBAN_LABEL: Record<BuyerKanbanStage, string> = {
  active: '진행중',
  closed: '마감',
};
```

라인 44-49 — classify (awarded → closed):
```ts
export function classifyBuyerRfp(args: { rfp: RFP }): BuyerKanbanStage {
  const { rfp } = args;
  if (rfp.status === 'awarded') return 'closed'; // 선정완료도 '마감' 버킷
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'closed';
  return 'active'; // status === 'sent'
}
```

라인 81 — compareBuyerCards 결과 컬럼 조건(`'awarded'` 항 제거):
```ts
  if (a.stage === 'closed') {
```

라인 1 상단 주석의 "3개 컬럼 (진행중/선정 완료/마감)" → "2개 컬럼 (진행중/마감)" 로 수정.

- [ ] **Step 4: GREEN 확인 (vitest)**

Run: `pnpm test lib/server/__tests__/buyer-kanban.test.ts`
Expected: PASS.

- [ ] **Step 5: PipelineCard 결과 칩 테스트 작성 (RED)**

`components/board/__tests__/PipelineCard.test.tsx` 생성:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PipelineCard } from '../PipelineCard';
import type { BoardCard } from '@/lib/types/column';
import type { BuyerKanbanCard } from '@/lib/server/buyer-kanban';

function buyerCard(over: Partial<BuyerKanbanCard>): BoardCard {
  const payload: BuyerKanbanCard = {
    rfpId: 'P-2605-0001',
    title: 'RFP',
    stage: 'closed',
    deadline: '2026-05-20T00:00:00Z',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
    invitedPgCount: 0,
    submittedBidCount: 0,
    isSample: false,
    isCancelled: false,
    status: 'closed',
    ...over,
  };
  return { cardType: 'rfp', cardId: 'r1', columnId: 'c-closed', payload };
}

describe('PipelineCard — buyer 결과 칩', () => {
  it('status=awarded → 선정완료 칩', () => {
    render(<PipelineCard card={buyerCard({ status: 'awarded' })} onSelect={() => {}} />);
    expect(screen.getByText('선정완료')).toBeInTheDocument();
  });

  it('status=closed → 미선정 칩', () => {
    render(<PipelineCard card={buyerCard({ status: 'closed' })} onSelect={() => {}} />);
    expect(screen.getByText('미선정')).toBeInTheDocument();
  });

  it('status=cancelled → 취소 칩', () => {
    render(<PipelineCard card={buyerCard({ status: 'cancelled', isCancelled: true })} onSelect={() => {}} />);
    expect(screen.getByText('취소')).toBeInTheDocument();
  });

  it('진행중(sent) 카드 → 결과 칩 없음', () => {
    render(
      <PipelineCard
        card={buyerCard({ stage: 'active', status: 'sent', deadline: '2027-01-01T00:00:00Z' })}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText('선정완료')).toBeNull();
    expect(screen.queryByText('미선정')).toBeNull();
  });
});
```

- [ ] **Step 6: RED 확인**

Run: `pnpm test components/board/__tests__/PipelineCard.test.tsx`
Expected: FAIL — 현재 BuyerBody 는 '취소됨'만 그리고 '선정완료'/'미선정' 칩 없음.

- [ ] **Step 7: PipelineCard 구현 (GREEN)**

`components/board/PipelineCard.tsx`:

라인 3 import 에 `RFP_STATUS_CHIP` 추가(기존 Chip import 아래):
```tsx
import { RFP_STATUS_CHIP } from '@/lib/rfp-status';
```

`BuyerBody`(라인 53-65) 교체:
```tsx
function BuyerBody({ card }: { card: BuyerKanbanCard }) {
  // 종결(마감) 컬럼 카드의 D-day 는 노이즈 — 컬럼명이 이미 마감을 전달하므로 숨김.
  const isResult = card.stage === 'closed';
  const result = isResult ? RFP_STATUS_CHIP[card.status] : undefined;
  return (
    <div className="space-y-2">
      <CardHead code={card.rfpId} deadline={card.deadline} hideDday={isResult} />
      {(result || card.isSample) && (
        // 결과 칩(선정완료/미선정/취소) + 샘플 칩이 동시 렌더 가능 — 한 행으로 묶어 간격 보장.
        <div className="flex flex-wrap gap-1">
          {result && <Chip label={result.label} color={result.color} />}
          {card.isSample && <Chip label="샘플" color="surface" />}
        </div>
      )}
```
(이하 `<p>{card.title}</p>` 부터는 기존과 동일 — 유지.)

- [ ] **Step 8: GREEN 확인**

Run: `pnpm test components/board/__tests__/PipelineCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 9: dragMatrix 테스트 갱신 (RED)**

`components/home/__tests__/dragMatrix.test.ts`의 `describe('resolveDrag — buyer', …)` 안 buyer 테스트(라인 5-18)를 교체:
```ts
  it('active → closed: navigate-rfp-detail (선정/취소는 상세에서)', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'closed', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'navigate-rfp-detail', rfpId: 'P-2605-0001' });
  });
```
(기존 "active → awarded" 테스트와 "invalid: awarded → closed" 테스트는 삭제 — 'awarded' 스테이지 제거. "invalid: same column" 테스트는 유지.)

- [ ] **Step 10: RED 확인**

Run: `pnpm test components/home/__tests__/dragMatrix.test.ts`
Expected: FAIL — active→closed 가 아직 `cancel-rfp` 반환.

- [ ] **Step 11: dragMatrix 구현 (GREEN)**

`components/home/dragMatrix.ts`:

`DragAction` union(라인 8-12)에서 `cancel-rfp` 멤버 삭제:
```ts
export type DragAction =
  | { kind: 'navigate-rfp-detail'; rfpId: string }
  | { kind: 'navigate-inbox'; rfpId: string }
  | { kind: 'withdraw-bid'; bidId: string; rfpId: string; title: string };
```

`resolveBuyer`(라인 38-52) 교체:
```ts
function resolveBuyer(i: BuyerInput): DragAction | null {
  if (i.from === i.to) return null;

  // 진행중 → 마감: 선정/취소는 상세(BidBoard)에서 결정 → 상세로 이동.
  if (i.from === 'active' && i.to === 'closed') {
    return { kind: 'navigate-rfp-detail', rfpId: i.rfpId };
  }

  return null;
}
```

- [ ] **Step 12: GREEN 확인**

Run: `pnpm test components/home/__tests__/dragMatrix.test.ts`
Expected: PASS.

- [ ] **Step 13: KanbanActionDialog 테스트 갱신 (RED)**

`components/home/__tests__/KanbanActionDialog.test.tsx`:
- "shows the cancel-rfp dialog…"(라인 39-49)·"calls cancelRfpAction…"(라인 63-78) 두 테스트 삭제.
- "calls onClose on cancel…"(라인 80-94)의 action 을 withdraw-bid 로 교체:
```tsx
      <KanbanActionDialog
        action={{ kind: 'withdraw-bid', bidId: 'b1', rfpId: 'r1', title: 'Test RFP' }}
        onClose={onClose}
        onCommitted={vi.fn()}
      />,
```
그리고 마지막 단언을 `expect(withdrawBid).not.toHaveBeenCalled();` 로 변경, 버튼 이름을 `'철회'` 로 변경(`screen.getByRole('button', { name: '돌아가기' })`는 그대로).
- 상단 `cancelRfp` 목·import·`mockReset`(라인 12,15-17,27) 삭제.

- [ ] **Step 14: RED 확인**

Run: `pnpm test components/home/__tests__/KanbanActionDialog.test.tsx`
Expected: FAIL — `KanbanActionDialog` 가 아직 `cancel-rfp` 분기를 가져 타입/런타임 불일치.

- [ ] **Step 15: KanbanActionDialog 구현 (GREEN)**

`components/home/KanbanActionDialog.tsx`:
- 라인 6 `import { cancelRfpAction } …` 삭제.
- `COPY`(라인 16-34)에서 `'cancel-rfp'` 항목 삭제.
- `onConfirm`(라인 52-62)에서 cancel-rfp 분기 삭제:
```ts
  const onConfirm = async () => {
    setSubmitting(true);
    try {
      let result: { ok: true } | { ok: false; error: string };
      if (action.kind === 'withdraw-bid') {
        result = await withdrawBidAction({ bidId: action.bidId });
      } else {
        result = { ok: false, error: 'UNREACHABLE' };
      }

      if (result.ok) {
        toast(copy.cta + ' 완료');
        onCommitted();
      } else {
        toast(`처리 실패 — ${result.error}`, { type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };
```
- 라인 49 주석 "여기 도달하는 action 은 cancel-rfp | withdraw-bid" → "여기 도달하는 action 은 withdraw-bid" 로 수정.

- [ ] **Step 16: GREEN 확인**

Run: `pnpm test components/home/__tests__/KanbanActionDialog.test.tsx`
Expected: PASS.

- [ ] **Step 17: resolveBoardDrop 테스트 갱신 (RED→GREEN: 소스 무변경)**

`components/board/__tests__/resolveBoardDrop.test.ts`:
- "rfp awarded → closed (no valid transition) → reject"(라인 25-34): payload `stage: 'awarded'` → `stage: 'closed'`, 제목 "rfp 종결 카드 → 마감 컬럼(동일 스테이지) → reject".
- "rfp active → closed lifecycle column → cancel-rfp action"(라인 36-45): 기대값 교체 →
```ts
    ).toEqual({ kind: 'lifecycle', action: { kind: 'navigate-rfp-detail', rfpId: 'P-2605-0009' } });
```
제목 "rfp active → closed lifecycle column → navigate-rfp-detail action" 로 수정.

Run: `pnpm test components/board/__tests__/resolveBoardDrop.test.ts`
Expected: PASS (resolveBoardDrop.ts 자체는 generic — 변경 없음; dragMatrix 변경이 동작을 바꿈).

- [ ] **Step 18: useBoardDnd 테스트 갱신 (fixture rewire)**

`components/board/__tests__/useBoardDnd.test.tsx`:
- `awardedCol`(라인 34) 선언 삭제, `columns`(라인 45) → `[activeCol, closedCol, customCol]`.
- "navigate lifecycle drop routes…"(라인 69-76): `drop('r1', 'c-awarded')` → `drop('r1', 'c-closed')` (active→closed 가 이제 navigate).
- "action lifecycle drop opens the confirm dialog…"(라인 78-89) 삭제(buyer 다이얼로그 액션 없음).
- "invalid lifecycle transition rejects…"(라인 104-119): `awardedCard` 를 종결 카드로 교체하고 active 컬럼으로 드롭(closed→active 무효):
```tsx
    const closedCard: BoardCard = {
      cardType: 'rfp',
      cardId: 'r2',
      columnId: 'c-closed',
      payload: { rfpId: 'P-2605-0002', title: '끝난 RFP', stage: 'closed' },
    };
    const { result } = setup([closedCard]);
    await act(async () => {
      result.current.handleDragEnd(drop('r2', 'c-active'));
    });
    expect(toast).toHaveBeenCalledWith('이 컬럼으로는 이동할 수 없습니다.', { type: 'info' });
    expect(push).not.toHaveBeenCalled();
    expect(moveCard).not.toHaveBeenCalled();
    expect(result.current.pendingAction).toBeNull();
```

Run: `pnpm test components/board/__tests__/useBoardDnd.test.tsx`
Expected: PASS.

- [ ] **Step 19: lifecycle-keys 테스트·소스 갱신 (RED→GREEN)**

`lib/server/columns/__tests__/lifecycle-keys.test.ts`:
- 기대 집합(라인 12-22)에서 `'awarded',`(buyer side) 삭제.
- 가드 describe(라인 33-39)에 추가:
```ts
    expect(isCrossSideLifecycleKey('awarded')).toBe(false); // 병합 — 선정완료는 마감으로 폴드
```

Run: `pnpm test lib/server/columns/__tests__/lifecycle-keys.test.ts`
Expected: FAIL — CROSS_SIDE 에 아직 'awarded' 존재.

`lib/server/columns/lifecycle-keys.ts:8-18` — `CROSS_SIDE_LIFECYCLE_KEYS` 에서 `'awarded',` 줄 삭제. 라인 3 주석의 "award→won/lost" 는 그대로(award 액션 프로토콜 — buyer 'awarded' 컬럼 존재와 무관).

Run: `pnpm test lib/server/columns/__tests__/lifecycle-keys.test.ts`
Expected: PASS.

- [ ] **Step 20: PipelineBoard 더보기 링크 정리**

`components/board/PipelineBoard.tsx:39-40` — rfp `awarded` 분기 2줄 삭제:
```ts
  if (cardType === 'rfp') {
    // 표의 'closed' 토큰은 cancelled+awarded 를 폴드 (status-filter.ts) — 마감 컬럼 모집단과 일치.
    if (lifecycleKey === 'closed')
      return { limit: RESULT_COLUMN_LIMIT, moreHref: tableDeepLink('/rfp', 'closed', current) };
    return null;
  }
```

- [ ] **Step 21: 전체 typecheck/lint (병합 무결성)**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음 — union 변경 소비처(PipelineCard·dragMatrix·KanbanActionDialog) 모두 갱신됨.

Run: `pnpm lint`
Expected: 에러 없음(사용 안 하는 import 등). 느리면 Bash `timeout` 600000ms.

- [ ] **Step 22: 커밋**

```bash
git add lib/server/buyer-kanban.ts components/board/PipelineCard.tsx components/board/PipelineBoard.tsx components/home/dragMatrix.ts components/home/KanbanActionDialog.tsx lib/server/columns/lifecycle-keys.ts components/board/__tests__/PipelineCard.test.tsx lib/server/__tests__/buyer-kanban.test.ts components/home/__tests__/dragMatrix.test.ts components/board/__tests__/resolveBoardDrop.test.ts components/board/__tests__/useBoardDnd.test.tsx components/home/__tests__/KanbanActionDialog.test.tsx lib/server/columns/__tests__/lifecycle-keys.test.ts
git commit -m "feat(kanban): 선정완료·마감 컬럼 병합 + 결과 칩 + 드롭=상세이동"
```

---

## Task 4: 마이그레이션 스크립트 + 시드 카운트 테스트

기존 워크스페이스의 잉여 '선정 완료'(lifecycleKey='awarded') 컬럼을 제거하는 1회성 스크립트. 카드는 `ON DELETE SET NULL`+`resolveCardColumn`이 '마감'으로 자동 재배치.

**Files:**
- Create: `scripts/remove-awarded-kanban-columns.ts`
- Test: `lib/server/actions/workspace/__tests__/createWorkspace.test.ts:135`

**Interfaces:**
- Consumes: `BUYER_KANBAN_ORDER`(Task 3, 이제 2개) — 신규 워크스페이스 시드가 2컬럼.

- [ ] **Step 1: 시드 카운트 테스트 갱신 (RED)**

`lib/server/actions/workspace/__tests__/createWorkspace.test.ts:135`:
```ts
    expect(cols.filter((c) => c.kind === 'pipeline')).toHaveLength(2);
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/actions/workspace/__tests__/createWorkspace.test.ts`
Expected: FAIL — 받은 길이 2 ≠ 기대 3 (이전 값). 단, Task 3 에서 ORDER 가 이미 2로 줄었으면 시드가 2개를 만들어 **수정 후** PASS. (즉 이 단언이 회귀 가드.)

> 주: `lib/server/columns/__tests__/seed.test.ts`는 `[...BUYER_KANBAN_ORDER]`를 직접 비교하므로 자동 적응 — 수정 불필요. Step 5 전체 스위트에서 green 확인.

- [ ] **Step 3: GREEN 확인**

Run: `pnpm test lib/server/actions/workspace/__tests__/createWorkspace.test.ts`
Expected: PASS.

- [ ] **Step 4: 마이그레이션 스크립트 작성**

`scripts/remove-awarded-kanban-columns.ts` 생성(`remove-draft-kanban-columns.ts` 패턴):
```ts
/**
 * scripts/remove-awarded-kanban-columns.ts — one-shot, idempotent.
 *
 * Removes the buyer pipeline '선정 완료' columns (lifecycle_key='awarded') that
 * were seeded into existing workspaces before 선정완료·마감 단계가 '마감' 하나로
 * 병합됐다. New workspaces never get it (removed from BUYER_KANBAN_ORDER); this
 * covers the ones that predate the change. Run via
 * `tsx scripts/remove-awarded-kanban-columns.ts`.
 *
 * Card placements re-home automatically: the cards' board_column_id FK is
 * ON DELETE SET NULL, so deleting the column nulls the pointer and
 * resolveCardColumn re-derives the column from the card's lifecycle stage
 * (awarded RFP → 'closed' 마감 컬럼).
 *
 * Re-running is safe: once the column is gone there is nothing to delete.
 */
import 'dotenv/config';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { columns } from '@/lib/db/schema';

async function main(): Promise<void> {
  const deleted = await db
    .delete(columns)
    .where(and(eq(columns.lifecycleKey, 'awarded'), eq(columns.kind, 'pipeline')))
    .returning({ id: columns.id });

  if (deleted.length === 0) {
    console.log('remove-awarded-kanban-columns: nothing to do (no awarded columns).');
    return;
  }
  console.log(`remove-awarded-kanban-columns: removed ${deleted.length} 선정 완료 columns.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 5: typecheck + 스크립트 형태 검증**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음.

> 스크립트는 실 DB 를 건드리므로 이 단계에서 **실행하지 않는다**(배포 시 1회 실행 — §배포). 형태는 기존 `remove-draft-kanban-columns.ts`와 동일해 회귀 위험 낮음.

- [ ] **Step 6: 커밋**

```bash
git add scripts/remove-awarded-kanban-columns.ts lib/server/actions/workspace/__tests__/createWorkspace.test.ts
git commit -m "feat(kanban): 잉여 선정완료 컬럼 제거 마이그레이션 + 시드 2컬럼"
```

---

## Task 5: 필터 · 사이드바 · 홈 KPI 통합 (Part 3)

선정완료(awarded)를 마감 필터/내비로 폴드. `awarded` URL 토큰 제거.

**Files:**
- Modify: `lib/server/status-filter.ts:4-9,25-29`
- Modify: `app/(app)/rfp/page.tsx:20-24`
- Modify: `lib/nav/nav-config.ts:55-60`
- Modify: `lib/server/dashboard/buildDashboard.ts:56`
- Test: `lib/server/__tests__/status-filter.test.ts`

**Interfaces:**
- Produces: `mapRfpParam('closed') = ['closed','cancelled','awarded']`; `mapRfpParam('awarded') = undefined`.

- [ ] **Step 1: status-filter 테스트 갱신 (RED)**

`lib/server/__tests__/status-filter.test.ts`:
- 라인 33: `expect(mapRfpParam('closed')).toEqual(['closed', 'cancelled', 'awarded']);`
- "maps awarded → [awarded]"(라인 36-38) 교체:
```ts
  it('awarded 토큰 제거 — 마감으로 폴드되어 undefined', () => {
    expect(mapRfpParam('awarded')).toBeUndefined();
  });
```
- "param=closed 는 closed + cancelled…"(라인 90-94) 교체:
```ts
  it('param=closed 는 closed + cancelled + awarded 반환 (마감 컬럼 모집단 일치)', () => {
    const result = filterRfpsByParam(allRfps, 'closed');
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.status).sort()).toEqual(['awarded', 'cancelled', 'closed']);
  });
```
- "filters to awarded when param=awarded"(라인 96-100) 교체:
```ts
  it('param=awarded 는 빈 배열 (토큰 제거 — 마감으로 통합)', () => {
    expect(filterRfpsByParam(allRfps, 'awarded')).toHaveLength(0);
  });
```
- 헤더 주석(라인 2) "…|closed|awarded" → "…|closed" 로 수정.

- [ ] **Step 2: RED 확인**

Run: `pnpm test lib/server/__tests__/status-filter.test.ts`
Expected: FAIL — closed 가 아직 2개만, awarded 토큰 존재.

- [ ] **Step 3: status-filter 구현 (GREEN)**

`lib/server/status-filter.ts:25-29`:
```ts
const RFP_PARAM_MAP: Record<string, readonly RfpStatus[]> = {
  active: ['sent'],
  closed: ['closed', 'cancelled', 'awarded'],
};
```
라인 4-9 주석 블록 갱신:
```ts
// RFP mapping (token → statuses it folds — 칸반 컬럼 모집단과 1:1):
//   active   → ['sent']
//   closed   → ['closed', 'cancelled', 'awarded']  (마감 컬럼이 셋을 폴드 — 선정완료 통합)
//   undefined / '' / unknown → undefined (show all)
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test lib/server/__tests__/status-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: 필터 옵션 · 사이드바 · KPI (설정/문구 — 시각 변경)**

`app/(app)/rfp/page.tsx:20-24` — STATUS_OPTIONS 에서 awarded 줄 삭제:
```ts
const STATUS_OPTIONS = [
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '마감' },
];
```

`lib/nav/nav-config.ts:55-60` — STATUS_LABELS['/rfp'] 에서 awarded 줄 삭제:
```ts
  '/rfp': {
    active: '진행중',
    closed: '마감',
  },
```

`lib/server/dashboard/buildDashboard.ts:56` — '선정 완료' KPI href 만 변경(value 유지):
```ts
  { id: 'awarded', label: '선정 완료', value: rfps.filter((r) => r.status === 'awarded').length, href: '/rfp?status=closed' },
```

- [ ] **Step 6: typecheck + lint**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음.

Run: `pnpm lint`
Expected: 에러 없음. 느리면 `timeout` 600000ms.

- [ ] **Step 7: 커밋**

```bash
git add lib/server/status-filter.ts lib/server/__tests__/status-filter.test.ts app/\(app\)/rfp/page.tsx lib/nav/nav-config.ts lib/server/dashboard/buildDashboard.ts
git commit -m "feat(rfp): 필터·사이드바·홈 KPI — 선정완료를 마감으로 통합"
```

---

## Task 6: 전체 검증 + 마무리

**Files:** 없음(검증만).

- [ ] **Step 1: 전체 typecheck**

Run: `pnpm tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 2: 전체 lint**

Run: `pnpm lint` (필요 시 `timeout` 600000ms)
Expected: 에러 0.

- [ ] **Step 3: 전체 테스트**

Run: `pnpm test`
Expected: 전부 green. (참고: 일부 환경적 jsdom localStorage 사전존재 실패는 본 변경과 무관 — 단독 파일 green 이 게이트. `MEMORY.md` jsdom-localstorage-mass-fail 참조.)

- [ ] **Step 4: 배포 체크리스트 확인(문서)**

`docs/superpowers/specs/2026-06-30-rfp-deadline-award-merge-design.md` §8 배포:
1. 코드 배포.
2. **`tsx scripts/remove-awarded-kanban-columns.ts` 1회 실행** — 기존 워크스페이스 잉여 '선정 완료' 컬럼 제거. 미실행 시 빈 컬럼 잔존.
3. DDL 없음, 일괄 로그아웃 없음.

PR 본문에 위 배포 단계를 명시한다.

- [ ] **Step 5: 수동 확인(선택, 시각)**

`/run` 또는 로컬 dev 로 buyer 보드/목록/사이드바/홈 KPI 에서 선정완료가 마감으로 통합되고 결과 칩이 뜨는지 육안 확인(회귀 방지는 자동 테스트가 담당 — 시각 확인은 보조).

---

## Self-Review

- **Spec coverage:** Part 1(칩 라벨)=Task 1 · Part 2(칸반: 스테이지/카드/DnD/lifecycle/PipelineBoard/마이그레이션)=Task 2·3·4 · Part 3(필터/사이드바/KPI)=Task 5 · 검증/배포=Task 6. ContextPanel=추가작업 없음(SSOT 상속, spec §4 확정)이라 별도 태스크 없음 — Task 1 의 SSOT 변경으로 자동 반영.
- **Type consistency:** `BuyerKanbanStage='active'|'closed'`(Task 3) ↔ classify/compare/ORDER/LABEL/fixtures 일치. `BuyerKanbanCard.status`(Task 2) ↔ PipelineCard 소비(Task 3) 일치. `DragAction` cancel-rfp 제거(Task 3) ↔ KanbanActionDialog COPY/onConfirm 일치. `RFP_PARAM_MAP` closed 폴드(Task 5) ↔ PipelineBoard moreHref 'closed'(Task 3 Step 20) 일치.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. TBD/TODO 없음.
