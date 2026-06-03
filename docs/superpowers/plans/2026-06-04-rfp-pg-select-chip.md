# RFP Step 3 PG사 선택 — 칩 토글 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RFP Step 3의 PG사 선택 UI를 Popover+cmdk 방식에서 칩 토글 + 전체선택 방식으로 교체하고, 클라이언트 fetch를 서버 컴포넌트 직접 주입으로 대체한다.

**Architecture:** `page.tsx`(서버 컴포넌트)에서 DB를 직접 쿼리해 `pgList`를 `RfpCreateWizard` → `RfpStep3PgSelect`로 prop 드릴다운한다. `useLazyPgWorkspaces` 훅을 삭제하고 `RfpStep3PgSelect`는 순수 prop 수신 컴포넌트가 된다.

**Tech Stack:** Next.js App Router (Server Component), Drizzle ORM, Zustand, Tailwind v4, Vitest + Testing Library

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `components/rfp/__tests__/RfpStep3PgSelect.test.tsx` | 전면 재작성 (새 동작 기준 7개 케이스) |
| `components/rfp/RfpStep3PgSelect.tsx` | 전면 재작성 (칩 UI, pgList prop) |
| `components/rfp/__tests__/RfpCreateWizard.test.tsx` | render 호출에 `pgList={[]}` 추가 |
| `components/rfp/RfpCreateWizard.tsx` | `pgList: PgWorkspace[]` prop 추가, Step 3에 전달 |
| `app/rfp/new/page.tsx` | DB 쿼리 추가, `pgList` prop 전달 |
| `hooks/useLazyPgWorkspaces.ts` | 삭제 |

---

## Task 1: `RfpStep3PgSelect` 테스트 재작성 (RED)

**Files:**
- Modify: `components/rfp/__tests__/RfpStep3PgSelect.test.tsx`

- [ ] **Step 1: 기존 테스트 파일 전체를 아래 내용으로 교체**

```tsx
// components/rfp/__tests__/RfpStep3PgSelect.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep3PgSelect } from '../RfpStep3PgSelect';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

const PG_LIST = [
  { id: 'pg-1', name: '나이스페이먼츠', displayName: '나이스페이먼츠' },
  { id: 'pg-2', name: 'KG이니시스', displayName: 'KG이니시스' },
];

function resetStore() {
  useRfpDraftStore.setState({ allowedPgWorkspaceIds: [] });
}

describe('RfpStep3PgSelect', () => {
  beforeEach(resetStore);

  it('pgList 항목이 버튼으로 렌더링된다', () => {
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '나이스페이먼츠' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'KG이니시스' })).toBeInTheDocument();
  });

  it('칩 클릭 시 store에 추가된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([
      { id: 'pg-1', displayName: '나이스페이먼츠' },
    ]);
  });

  it('선택된 칩 클릭 시 store에서 제거된다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스페이먼츠' }],
    });
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toHaveLength(0);
  });

  it('전체 선택 버튼 클릭 시 pgList 전체가 store에 추가된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([
      { id: 'pg-1', displayName: '나이스페이먼츠' },
      { id: 'pg-2', displayName: 'KG이니시스' },
    ]);
  });

  it('전체 선택 후 버튼 라벨이 "전체 해제"로 바뀐다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(screen.getByRole('button', { name: '전체 해제' })).toBeInTheDocument();
  });

  it('전체 해제 버튼 클릭 시 store가 빈 배열이 된다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [
        { id: 'pg-1', displayName: '나이스페이먼츠' },
        { id: 'pg-2', displayName: 'KG이니시스' },
      ],
    });
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '전체 해제' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toHaveLength(0);
  });

  it('이전/다음 버튼 클릭 시 onBack/onNext가 호출된다', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onNext = vi.fn();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={onBack} onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 테스트가 실패(RED)함을 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/__tests__/RfpStep3PgSelect.test.tsx
```

기대 결과: `pgList` prop 없음 등으로 타입 에러 또는 런타임 에러 — **FAIL**

---

## Task 2: `RfpStep3PgSelect` 컴포넌트 재작성 (GREEN)

**Files:**
- Modify: `components/rfp/RfpStep3PgSelect.tsx`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```tsx
'use client';

import { Button } from '@/components/primitives/Button';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

export type PgWorkspace = { id: string; name: string; displayName: string };

type Props = {
  pgList: PgWorkspace[];
  onBack: () => void;
  onNext: () => void;
};

export function RfpStep3PgSelect({ pgList, onBack, onNext }: Props) {
  const draft = useRfpDraftStore();

  const selectedIds = new Set(draft.allowedPgWorkspaceIds.map((w) => w.id));
  const allSelected = pgList.length > 0 && selectedIds.size === pgList.length;

  const handleToggle = (ws: PgWorkspace) => {
    if (selectedIds.has(ws.id)) {
      draft.setField(
        'allowedPgWorkspaceIds',
        draft.allowedPgWorkspaceIds.filter((w) => w.id !== ws.id),
      );
    } else {
      draft.setField('allowedPgWorkspaceIds', [
        ...draft.allowedPgWorkspaceIds,
        { id: ws.id, displayName: ws.displayName },
      ]);
    }
  };

  const handleToggleAll = () => {
    if (allSelected) {
      draft.setField('allowedPgWorkspaceIds', []);
    } else {
      draft.setField(
        'allowedPgWorkspaceIds',
        pgList.map((ws) => ({ id: ws.id, displayName: ws.displayName })),
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          PG사 선택
        </span>
        <button
          type="button"
          onClick={handleToggleAll}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-primary)]"
        >
          {allSelected ? '전체 해제' : '전체 선택'}
        </button>
      </div>

      <div className="flex flex-wrap gap-[6px]">
        {pgList.map((ws) => {
          const selected = selectedIds.has(ws.id);
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => handleToggle(ws)}
              className={
                selected
                  ? 'py-[5px] px-3 rounded-[6px] text-[13px] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] border border-[var(--md-sys-color-primary)]'
                  : 'py-[5px] px-3 rounded-[6px] text-[13px] bg-transparent text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]'
              }
            >
              {ws.displayName}
            </button>
          );
        })}
      </div>

      {draft.allowedPgWorkspaceIds.length > 0 && (
        <p className="font-mono text-[10px] tracking-[0.08em] text-[var(--md-sys-color-primary)]">
          {draft.allowedPgWorkspaceIds.length}개 선택됨
        </p>
      )}

      <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button type="button" variant="outlined" size="md" onClick={onBack}>
          이전
        </Button>
        <Button type="button" size="md" onClick={onNext}>
          다음
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 테스트 통과(GREEN) 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/__tests__/RfpStep3PgSelect.test.tsx
```

기대 결과: **7개 PASS**

- [ ] **Step 3: 커밋**

```bash
git add components/rfp/__tests__/RfpStep3PgSelect.test.tsx components/rfp/RfpStep3PgSelect.tsx
git commit -m "feat(rfp): Step 3 PG사 선택 UI — 칩 토글 + 전체선택으로 교체"
```

---

## Task 3: `RfpCreateWizard` prop 추가

**Files:**
- Modify: `components/rfp/RfpCreateWizard.tsx`
- Modify: `components/rfp/__tests__/RfpCreateWizard.test.tsx`

- [ ] **Step 1: `RfpCreateWizard.tsx` — import 추가 및 Props 타입 수정**

파일 상단 import에 추가:
```ts
import type { PgWorkspace } from './RfpStep3PgSelect';
```

Props 타입 변경:
```ts
// 변경 전
type Props = {
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  workspaceName?: string;
  guest?: boolean;
};

// 변경 후
type Props = {
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  workspaceName?: string;
  guest?: boolean;
  pgList: PgWorkspace[];
};
```

함수 시그니처 수정:
```ts
// 변경 전
export function RfpCreateWizard({ bizProfile, workspaceName, guest }: Props) {

// 변경 후
export function RfpCreateWizard({ bizProfile, workspaceName, guest, pgList }: Props) {
```

Step 3 렌더 부분 수정:
```tsx
// 변경 전
{currentStep === 3 && <RfpStep3PgSelect onBack={back} onNext={advance} />}

// 변경 후
{currentStep === 3 && <RfpStep3PgSelect pgList={pgList} onBack={back} onNext={advance} />}
```

- [ ] **Step 2: `RfpCreateWizard.test.tsx` — 모든 `render(<RfpCreateWizard` 호출에 `pgList={[]}` 추가**

파일 내 `render(<RfpCreateWizard` 가 6곳 있다. 모두 아래 패턴으로 수정:

```tsx
// 변경 전 예시
render(<RfpCreateWizard />);
render(<RfpCreateWizard guest />);

// 변경 후
render(<RfpCreateWizard pgList={[]} />);
render(<RfpCreateWizard pgList={[]} guest />);
```

- [ ] **Step 3: 테스트 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/__tests__/RfpCreateWizard.test.tsx
```

기대 결과: **기존 테스트 전부 PASS** (Step 3 mock이 pgList를 무시하므로 동작 동일)

- [ ] **Step 4: 커밋**

```bash
git add components/rfp/RfpCreateWizard.tsx components/rfp/__tests__/RfpCreateWizard.test.tsx
git commit -m "feat(rfp): RfpCreateWizard에 pgList prop 추가"
```

---

## Task 4: `page.tsx` — 서버 DB 쿼리 + prop 전달

**Files:**
- Modify: `app/rfp/new/page.tsx`

- [ ] **Step 1: 파일 상단 import 추가**

기존 import 블록에 추가:
```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import type { PgWorkspace } from '@/components/rfp/RfpStep3PgSelect';
```

- [ ] **Step 2: PG 목록 쿼리를 PG redirect 체크 이후에 삽입**

`if (session?.user?.workspaceType === 'pg') { redirect(...) }` 블록 바로 아래에 삽입 (PG 유저는 redirect로 이탈하므로 불필요한 쿼리 방지):

```ts
const pgRows = await db
  .select({ id: workspaces.id, name: workspaces.name })
  .from(workspaces)
  .where(eq(workspaces.type, 'pg'))
  .limit(500);

const nameCount = new Map<string, number>();
for (const row of pgRows) {
  nameCount.set(row.name, (nameCount.get(row.name) ?? 0) + 1);
}

const pgList: PgWorkspace[] = pgRows.map((row) => ({
  id: row.id,
  name: row.name,
  displayName:
    (nameCount.get(row.name) ?? 1) > 1
      ? `${row.name} #${row.id.slice(0, 8)}`
      : row.name,
}));
```

- [ ] **Step 3: 두 `<RfpCreateWizard>` 호출 모두에 `pgList={pgList}` 추가**

게스트 분기:
```tsx
// 변경 전
<RfpCreateWizard guest />

// 변경 후
<RfpCreateWizard guest pgList={pgList} />
```

인증된 사용자 분기:
```tsx
// 변경 전
<RfpCreateWizard
  bizProfile={ws?.bizProfile ?? undefined}
  workspaceName={ws?.name ?? ''}
/>

// 변경 후
<RfpCreateWizard
  bizProfile={ws?.bizProfile ?? undefined}
  workspaceName={ws?.name ?? ''}
  pgList={pgList}
/>
```

- [ ] **Step 4: 타입체크 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -v "Cannot find name '(vi|describe|it|expect|beforeEach)'"
```

기대 결과: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/rfp/new/page.tsx
git commit -m "feat(rfp): page.tsx에서 PG 목록 서버 직접 쿼리 후 prop 전달"
```

---

## Task 5: `useLazyPgWorkspaces` 훅 삭제

**Files:**
- Delete: `hooks/useLazyPgWorkspaces.ts`

- [ ] **Step 1: 잔여 참조 확인**

```bash
grep -rn "useLazyPgWorkspaces" /Users/yeonseong/project/bidit --include="*.ts" --include="*.tsx" | grep -v ".worktrees"
```

기대 결과: 결과 없음 (이미 Task 2~4에서 모두 제거됨)

- [ ] **Step 2: 파일 삭제**

```bash
rm hooks/useLazyPgWorkspaces.ts
```

- [ ] **Step 3: 전체 테스트 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test --project jsdom
```

기대 결과: 전체 PASS (BidForm 드래프트 플레이크는 재실행)

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "chore(rfp): useLazyPgWorkspaces 훅 삭제 — 서버 prop 주입으로 대체"
```
