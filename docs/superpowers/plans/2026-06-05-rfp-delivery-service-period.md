# RFP "배송 및 서비스 기간" 필드 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RFP 작성 폼(Step 2)에 "배송 및 서비스 기간" 텍스트 입력 필드를 추가하고, PG 브리프 패널에도 표시하며, NDX 용어 설명 InfoTip을 등록한다.

**Architecture:** 기존 `currentSettlementCycle` 필드와 동일한 6-파일 패턴을 따른다. DB 스키마 → 타입 → 스토어 → 용어집을 먼저 세팅(TDD 면제)하고, 이후 폼·액션·패널 각각을 RED→GREEN TDD 사이클로 구현한다.

**Tech Stack:** Drizzle ORM (Postgres), Zustand (persist v3), zod v4, React 19, Vitest + @testing-library/react (jsdom), PGlite (액션 테스트)

---

### Task 1: DB 스키마 + RFP 타입 + 스토어 + 용어집 (TDD 면제 계층)

> 테스트가 직접 검증할 수 없는 선언 파일들 — 타입 안전성으로 대체.
> DB 적용은 dev 로컬에 `ALTER TABLE` 직접 실행 (push-only 프로젝트).

**Files:**
- Modify: `lib/db/schema/rfps.ts`
- Modify: `lib/types/rfp.ts`
- Modify: `lib/stores/rfp-draft.ts`
- Modify: `lib/glossary.ts`
- Modify: `lib/server/repositories/drizzle/rfp.ts` ← 버그픽스 포함

- [ ] **Step 1: DB 스키마에 컬럼 추가**

`lib/db/schema/rfps.ts` — `currentSettlementCycle` 다음 줄에 추가:

```ts
currentSettlementCycle: text('current_settlement_cycle'),
deliveryServicePeriod: text('delivery_service_period'),   // ← 추가
currentSolution: text('current_solution'),
```

- [ ] **Step 2: RFP 타입에 필드 추가**

`lib/types/rfp.ts` — `currentSettlementCycle` 다음 줄에 추가:

```ts
currentSettlementCycle?: string;
deliveryServicePeriod?: string;   // ← 추가
currentSolution?: string;
```

- [ ] **Step 3: Zustand 스토어 업데이트**

`lib/stores/rfp-draft.ts` 를 아래와 같이 4군데 수정한다.

**3-a. `RfpDraftStore` 타입** — `currentSettlementCycle` 바로 다음에:
```ts
currentSettlementCycle: string;
deliveryServicePeriod: string;   // ← 추가
currentSolution: string;
```

**3-b. `defaultState`** — `currentSettlementCycle` 바로 다음에:
```ts
currentSettlementCycle: '',
deliveryServicePeriod: '',   // ← 추가
currentSolution: '',
```

**3-c. `version`** — 2 → 3:
```ts
version: 3,
```

**3-d. `migrate`** — 기존 `version < 2` 블록 바로 뒤에 추가:
```ts
if (version < 2) {
  return {
    ...state,
    currentSettlementCycle: state.currentSettlementCycle ?? '',
  };
}
if (version < 3) {   // ← 추가
  return {
    ...state,
    deliveryServicePeriod: state.deliveryServicePeriod ?? '',
  };
}
return state;
```

**3-e. `partialize`** — `currentSettlementCycle` 바로 다음에:
```ts
currentSettlementCycle: state.currentSettlementCycle,
deliveryServicePeriod: state.deliveryServicePeriod,   // ← 추가
currentSolution: state.currentSolution,
```

- [ ] **Step 4: 레포지터리 매퍼에 누락 필드 추가 (버그픽스 포함)**

`lib/server/repositories/drizzle/rfp.ts` — `rowToRfp` 함수 내 `currentGuaranteeInsurance` 줄 바로 다음에 추가:

```ts
currentGuaranteeInsurance: row.currentGuaranteeInsurance ?? undefined,
currentSettlementCycle: row.currentSettlementCycle ?? undefined,   // ← 이전 커밋 누락 픽스
deliveryServicePeriod: row.deliveryServicePeriod ?? undefined,     // ← 신규
rfpFiles: [], // attachments hydrated separately when needed
```

> **참고:** `currentSettlementCycle`은 `aa11524` 커밋에서 스키마·타입에는 추가됐으나 `rowToRfp`에서 빠졌던 사전 버그다. 이 커밋에서 함께 픽스한다.

- [ ] **Step 5: 용어집에 NDX 항목 추가**

`lib/glossary.ts` — `정산주기` 항목 바로 다음에 추가:

```ts
NDX: {
  label: '배송 및 서비스 기간',
  description:
    '결제 후 실제 배송이나 서비스 제공까지 걸리는 기간이에요. D+1은 다음 영업일 배송, D+7은 최대 7일 처리를 뜻해요. PG는 이 기간을 리스크 평가에 참고해요.',
},
```

- [ ] **Step 6: 타입 체크**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"
```

Expected: 오류 없음 (또는 기존 typecheck 이슈만 출력).

- [ ] **Step 7: dev DB에 컬럼 적용**

```bash
psql postgresql://postgres:postgres@localhost:5432/supporter_b -c \
  "ALTER TABLE rfps ADD COLUMN IF NOT EXISTS delivery_service_period text;"
```

Expected: `ALTER TABLE`

- [ ] **Step 8: 커밋**

```bash
git add lib/db/schema/rfps.ts lib/types/rfp.ts lib/stores/rfp-draft.ts lib/glossary.ts \
  lib/server/repositories/drizzle/rfp.ts
git commit -m "feat(rfp): deliveryServicePeriod — DB 스키마·타입·스토어·용어집·레포 매퍼 추가 (currentSettlementCycle 누락 픽스 포함)"
```

---

### Task 2: TDD — 폼 입력 필드 (RfpStep2Content)

**Files:**
- Modify: `components/rfp/__tests__/RfpStep2Content.test.tsx`
- Modify: `components/rfp/RfpStep2Content.tsx`

- [ ] **Step 1: resetStore에 새 필드 추가 (테스트 픽스처 준비)**

`components/rfp/__tests__/RfpStep2Content.test.tsx` — `resetStore` 함수의 `useRfpDraftStore.setState` 객체에 추가:

```ts
function resetStore() {
  useRfpDraftStore.setState({
    title: '',
    websiteUrl: '',
    mainProducts: '',
    annualPgVolume: '',
    currentFeeRate: '',
    currentSettlementLimit: '',
    currentGuaranteeInsurance: '',
    currentSettlementCycle: '',
    deliveryServicePeriod: '',   // ← 추가
    currentSolution: '',
    currentSolutionDetail: '',
    memo: '',
    rfpFiles: [],
  });
}
```

- [ ] **Step 2: 실패 테스트 작성**

같은 파일 맨 아래에 두 테스트 추가:

```ts
it('배송 및 서비스 기간 입력 필드가 렌더된다', () => {
  render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
  expect(screen.getByPlaceholderText('D+3')).toBeInTheDocument();
});

it('배송 및 서비스 기간 입력 시 store에 반영된다', async () => {
  const user = userEvent.setup();
  render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
  await user.type(screen.getByPlaceholderText('D+3'), 'D+5');
  expect(useRfpDraftStore.getState().deliveryServicePeriod).toBe('D+5');
});
```

- [ ] **Step 3: RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/__tests__/RfpStep2Content.test.tsx
```

Expected: 마지막 두 테스트 **FAIL** — `getByPlaceholderText('D+3')` 를 찾지 못함.

- [ ] **Step 4: 폼에 입력 필드 추가**

`components/rfp/RfpStep2Content.tsx` — `현재 정산주기` 블록(`currentSettlementCycle` input) 바로 다음에 추가:

```tsx
<div className="space-y-1">
  <div className="flex items-center gap-1">
    <Label size="md" muted={false}>배송 및 서비스 기간</Label>
    <InfoTip term="NDX" />
  </div>
  <input
    type="text"
    value={draft.deliveryServicePeriod}
    onChange={(e) => draft.setField('deliveryServicePeriod', e.target.value)}
    placeholder="D+3"
    className={underlineInputClass}
  />
</div>
```

- [ ] **Step 5: GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/__tests__/RfpStep2Content.test.tsx
```

Expected: **모든 테스트 PASS**.

- [ ] **Step 6: 커밋**

```bash
git add components/rfp/__tests__/RfpStep2Content.test.tsx components/rfp/RfpStep2Content.tsx
git commit -m "feat(rfp): 배송 및 서비스 기간 폼 입력 필드 추가"
```

---

### Task 3: TDD — Server Action (createRfpAction)

**Files:**
- Modify: `lib/server/actions/rfp/__tests__/create.test.ts`
- Modify: `lib/server/actions/rfp/createRfpAction.ts`

- [ ] **Step 1: 실패 테스트 작성**

`lib/server/actions/rfp/__tests__/create.test.ts` — `currentSettlementCycle` 관련 두 테스트(line 597–624) 바로 다음, `void and;` 줄 앞에 추가:

```ts
it('persists deliveryServicePeriod when supplied', async () => {
  const r = await createRfpAction({
    title: '배송기간 필드 테스트',
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    allowedPgWorkspaceIds: [pgWsId],
    deliveryServicePeriod: 'D+3',
    send: false,
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
  expect(row.deliveryServicePeriod).toBe('D+3');
});

it('stores NULL for deliveryServicePeriod when omitted', async () => {
  const r = await createRfpAction({
    title: '배송기간 생략 테스트',
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    allowedPgWorkspaceIds: [pgWsId],
    send: false,
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
  expect(row.deliveryServicePeriod).toBeNull();
});
```

- [ ] **Step 2: RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/rfp/__tests__/create.test.ts
```

Expected: 새로 추가한 두 테스트 **FAIL** — TypeScript 컴파일 오류 또는 DB에 컬럼이 없어 insert 실패.

- [ ] **Step 3: zod 스키마에 필드 추가**

`lib/server/actions/rfp/createRfpAction.ts` — `Input` 스키마 내 `currentSettlementCycle` 줄 바로 다음에 추가:

```ts
currentSettlementCycle: z.string().max(50).optional(),
deliveryServicePeriod: z.string().max(100).optional(),   // ← 추가
currentSolution: z.enum(['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other']).optional(),
```

- [ ] **Step 4: rfps insert에 필드 추가**

같은 파일 `tx.insert(rfps).values({...})` 블록 내 `currentSettlementCycle` 줄 바로 다음에 추가:

```ts
currentSettlementCycle: parsed.data.currentSettlementCycle?.trim() ?? null,
deliveryServicePeriod: parsed.data.deliveryServicePeriod?.trim() ?? null,   // ← 추가
currentSolution: parsed.data.currentSolution ?? null,
```

- [ ] **Step 5: GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/rfp/__tests__/create.test.ts
```

Expected: **모든 테스트 PASS**.

- [ ] **Step 6: 커밋**

```bash
git add lib/server/actions/rfp/__tests__/create.test.ts lib/server/actions/rfp/createRfpAction.ts
git commit -m "feat(rfp): createRfpAction에 deliveryServicePeriod 필드 추가"
```

---

### Task 4: TDD — PG 브리프 패널 (RfpBriefPanel)

**Files:**
- Modify: `components/inbox/__tests__/RfpBriefPanel.test.tsx`
- Modify: `components/inbox/RfpBriefPanel.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`components/inbox/__tests__/RfpBriefPanel.test.tsx` — `currentSettlementCycle` 두 테스트 바로 다음에 추가:

```ts
it('deliveryServicePeriod 있을 때 "배송 및 서비스 기간" 행이 표시된다', () => {
  render(
    <RfpBriefPanel rfp={{ ...rfp, deliveryServicePeriod: 'D+3' }} buyerName="(주)진짜상사" />,
  );
  expect(screen.getByText('배송 및 서비스 기간')).toBeInTheDocument();
  expect(screen.getByText('D+3')).toBeInTheDocument();
});

it('deliveryServicePeriod 없을 때 "배송 및 서비스 기간" 행이 없다', () => {
  render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
  expect(screen.queryByText('배송 및 서비스 기간')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/inbox/__tests__/RfpBriefPanel.test.tsx
```

Expected: 새 두 테스트 **FAIL** — `배송 및 서비스 기간` 텍스트를 찾지 못함.

- [ ] **Step 3: 패널에 행 추가**

`components/inbox/RfpBriefPanel.tsx` — "사업 운영 정보" 섹션의 `.some(Boolean)` 체크 배열과 행 목록을 수정.

**노출 조건 체크 (line 110):**
```tsx
{[rfp.websiteUrl, rfp.mainProducts, rfp.annualPgVolume, rfp.currentFeeRate,
  rfp.currentSettlementLimit, rfp.currentGuaranteeInsurance,
  rfp.currentSettlementCycle, rfp.deliveryServicePeriod].some(Boolean) && (
```

**행 목록 (`['현재 정산주기', rfp.currentSettlementCycle]` 바로 다음에):**
```tsx
['현재 정산주기', rfp.currentSettlementCycle],
['배송 및 서비스 기간', rfp.deliveryServicePeriod],   // ← 추가
```

- [ ] **Step 4: GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/inbox/__tests__/RfpBriefPanel.test.tsx
```

Expected: **모든 테스트 PASS**.

- [ ] **Step 5: 전체 테스트 스위트 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project jsdom
```

Expected: 기존 테스트 포함 전체 PASS (BidForm localStorage 플레이크는 재실행으로 해소).

- [ ] **Step 6: 최종 커밋**

```bash
git add components/inbox/__tests__/RfpBriefPanel.test.tsx components/inbox/RfpBriefPanel.tsx
git commit -m "feat(rfp): RfpBriefPanel에 배송 및 서비스 기간 행 추가"
```
