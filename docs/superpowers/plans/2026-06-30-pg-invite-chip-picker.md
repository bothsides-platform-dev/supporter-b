# PG 관리 'PG 워크스페이스 추가' 인라인 칩 전환 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구매사 딜룸 'PG 관리' 탭의 'PG 워크스페이스 추가' UI를 `Popover + cmdk` 드롭다운 검색에서 견적 작성 위저드와 동일한 인라인 칩 선택으로 바꾼다.

**Architecture:** 단일 클라이언트 컴포넌트 `components/rfp/RfpInviteManager.tsx`의 선택 표면만 교체한다. 칩 클릭은 기존 서버 액션(`addPgWorkspacesToRfpAction`)을 그대로 호출하고, 이미 초대된 PG는 칩 풀에서 제외한다. 서버 액션·`/api/workspaces/search`·데이터·DB 스키마는 불변(UI-only). 검색이 사라지므로 죽은 `chosungCommandFilter`와 전용 단위 테스트를 제거한다.

**Tech Stack:** Next.js App Router(React 19), TypeScript strict, Tailwind v4 + `--md-sys-*` CSS 변수 토큰, Vitest + Testing Library(jsdom), Playwright(e2e).

## Global Constraints

- **UI-only.** 서버 액션·서비스·리포지토리·`/api/workspaces/search`·DB 스키마·`addPgWorkspacesToRfpAction` 시그니처 불변.
- **TDD 하드룰.** 실패 테스트 먼저(RED 직접 확인) → 최소 구현(GREEN). 단일 파일 실행: `pnpm test <path>`.
- **Linear 디자인 토큰.** 색·모양은 `var(--md-sys-color-*)`. 인터랙티브 요소 6px(`rounded-[6px]`), pill 금지. 본문 13–14px.
- **상태는 Chip으로.** 평문 대괄호 표기(`[ 대기중 ]`) 금지 — 보조 문구의 상태는 따옴표/칩 언어로.
- **UX 라이팅.** 해요체·능동형(`UX_WRITING.md`).
- **의존성 유지.** `@radix-ui/react-popover`·`cmdk`·`es-hangul`은 다른 곳에서 쓰이므로 package.json에서 제거하지 않는다 — 이 파일의 import만 제거.
- **워크트리 LSP 거짓 진단 무시.** fresh `pnpm tsc --noEmit` + `pnpm test`가 진실.

---

## File Structure

- **Modify:** `components/rfp/RfpInviteManager.tsx` — 선택 표면 교체(드롭다운 → 칩), `chosungCommandFilter`·cmdk·popover·es-hangul import 제거, `WorkspaceAvatar`·`useEffect` eager-load 추가.
- **Rewrite:** `components/rfp/__tests__/RfpInviteManager.test.tsx` — `chosungCommandFilter` describe 삭제, 칩 기반 컴포넌트 테스트로 재작성.
- **Modify:** `e2e/scenario-d-buyer-add-pg.spec.ts` — 드롭다운 클릭 흐름을 칩 직접 클릭으로, `canEdit=false` 단언을 추가 영역 부재로 갱신.

---

## Task 1: RfpInviteManager 드롭다운 → 인라인 칩

**Files:**
- Modify: `components/rfp/RfpInviteManager.tsx` (전체 재작성)
- Test: `components/rfp/__tests__/RfpInviteManager.test.tsx` (전체 재작성)

**Interfaces:**
- Consumes (불변):
  - `useLazyPgWorkspaces(): { pgList: PgWorkspace[]; loading: boolean; error: string | null; load: () => void }` — `PgWorkspace = { id: string; name: string; displayName: string; logoUpdatedAt: string | null }`.
  - `addPgWorkspacesToRfpAction({ rfpId: string; workspaceIds: string[] }): Promise<{ ok: true } | { ok: false; error: string }>`.
  - `sendDraftInvitationsAction({ rfpId: string }): Promise<{ ok: true; sentCount: number } | { ok: false; error: string }>`.
  - `WorkspaceAvatar({ name: string; size?: 'sm' | 'md'; workspaceId?: string; logoUpdatedAt?: string | null })`.
- Produces: `RfpInviteManager({ rfpId: string; invitations: InvitationView[]; canEdit: boolean })` — props 시그니처 불변. `InvitationView = { wsId: string; wsName: string; status: InvitationStatus }`.

- [ ] **Step 1: 단위 테스트를 칩 기반으로 재작성 (RED)**

`components/rfp/__tests__/RfpInviteManager.test.tsx` 전체를 아래로 교체한다. (기존 `chosungCommandFilter` describe 삭제 — 함수가 사라지므로 import 자체가 컴파일 에러가 되어 RED.)

```tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// hoisted 핸들 — vi.mock 팩토리에서 안전하게 참조하려면 vi.hoisted 사용.
const { useLazyPgWorkspacesMock, addPgWorkspacesToRfpActionMock } = vi.hoisted(() => ({
  useLazyPgWorkspacesMock: vi.fn(),
  addPgWorkspacesToRfpActionMock: vi.fn(),
}));

vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/hooks/useLazyPgWorkspaces', () => ({
  useLazyPgWorkspaces: () => useLazyPgWorkspacesMock(),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/rfp', () => ({
  addPgWorkspacesToRfpAction: addPgWorkspacesToRfpActionMock,
  sendDraftInvitationsAction: vi.fn(),
}));

import { RfpInviteManager } from '../RfpInviteManager';

const PG_A = { id: 'pg-a', name: 'KG이니시스', displayName: 'KG이니시스', logoUpdatedAt: null };
const PG_B = { id: 'pg-b', name: 'NHN KCP', displayName: 'NHN KCP', logoUpdatedAt: null };

function mockHook(over: Partial<{ pgList: typeof PG_A[]; loading: boolean; error: string | null }> = {}) {
  useLazyPgWorkspacesMock.mockReturnValue({
    pgList: over.pgList ?? [],
    loading: over.loading ?? false,
    error: over.error ?? null,
    load: vi.fn(),
  });
}

beforeEach(() => {
  useLazyPgWorkspacesMock.mockReset();
  addPgWorkspacesToRfpActionMock.mockReset();
  addPgWorkspacesToRfpActionMock.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('RfpInviteManager — 인라인 칩 추가', () => {
  it('공유 링크 섹션은 노출되지 않는다', () => {
    mockHook({ pgList: [PG_A, PG_B] });
    render(<RfpInviteManager rfpId="rfp-1" invitations={[]} canEdit />);
    expect(screen.queryByText('공유 링크')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '복사' })).not.toBeInTheDocument();
  });

  it('추가 가능한 PG를 칩 버튼으로 렌더한다', () => {
    mockHook({ pgList: [PG_A, PG_B] });
    render(<RfpInviteManager rfpId="rfp-1" invitations={[]} canEdit />);
    expect(screen.getByRole('button', { name: 'KG이니시스' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NHN KCP' })).toBeInTheDocument();
  });

  it('이미 초대된 PG는 칩 버튼으로 렌더하지 않는다', () => {
    mockHook({ pgList: [PG_A, PG_B] });
    render(
      <RfpInviteManager
        rfpId="rfp-1"
        invitations={[{ wsId: 'pg-a', wsName: 'KG이니시스', status: 'draft' }]}
        canEdit
      />,
    );
    expect(screen.queryByRole('button', { name: 'KG이니시스' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NHN KCP' })).toBeInTheDocument();
  });

  it('칩 클릭 시 addPgWorkspacesToRfpAction을 해당 wsId로 호출한다', async () => {
    mockHook({ pgList: [PG_A, PG_B] });
    render(<RfpInviteManager rfpId="rfp-1" invitations={[]} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'NHN KCP' }));
    await waitFor(() =>
      expect(addPgWorkspacesToRfpActionMock).toHaveBeenCalledWith({
        rfpId: 'rfp-1',
        workspaceIds: ['pg-b'],
      }),
    );
  });

  it('목록이 비어있으면 불러오는 중 안내를 보여준다', () => {
    mockHook({ pgList: [], loading: true });
    render(<RfpInviteManager rfpId="rfp-1" invitations={[]} canEdit />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('모든 PG가 이미 초대되면 빈 안내를 보여준다', () => {
    mockHook({ pgList: [PG_A] });
    render(
      <RfpInviteManager
        rfpId="rfp-1"
        invitations={[{ wsId: 'pg-a', wsName: 'KG이니시스', status: 'draft' }]}
        canEdit
      />,
    );
    expect(screen.getByText('모든 PG를 이미 추가했어요.')).toBeInTheDocument();
  });

  it('에러 시 에러 문구를 보여준다', () => {
    mockHook({ error: '불러오기 실패. 다시 시도해주세요.' });
    render(<RfpInviteManager rfpId="rfp-1" invitations={[]} canEdit />);
    expect(screen.getByText('불러오기 실패. 다시 시도해주세요.')).toBeInTheDocument();
  });

  it('canEdit=false면 추가 영역을 렌더하지 않는다', () => {
    mockHook({ pgList: [PG_A, PG_B] });
    render(<RfpInviteManager rfpId="rfp-1" invitations={[]} canEdit={false} />);
    expect(screen.queryByText('PG 워크스페이스 추가')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'KG이니시스' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인 (RED)**

Run: `pnpm test components/rfp/__tests__/RfpInviteManager.test.tsx`
Expected: FAIL — 현재 컴포넌트는 칩을 렌더하지 않으므로 `getByRole('button', { name: 'KG이니시스' })` 등이 없어서 실패. (구 `chosungCommandFilter` import도 제거됐으니 구현 전이라면 컴파일/런타임 에러로 RED.)

- [ ] **Step 3: RfpInviteManager.tsx 전체 재작성 (GREEN)**

`components/rfp/RfpInviteManager.tsx` 전체를 아래로 교체한다.

```tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Chip } from '@/components/primitives/Chip';
import type { ChipColor } from '@/components/primitives/Chip';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { CounterpartyProfileCard } from '@/components/messages/CounterpartyProfileCard';
import {
  addPgWorkspacesToRfpAction,
  sendDraftInvitationsAction,
} from '@/lib/server/actions/rfp';
import { useLazyPgWorkspaces } from '@/hooks/useLazyPgWorkspaces';
import type { PgWorkspace } from '@/hooks/useLazyPgWorkspaces';
import { toast } from '@/lib/toast';
import { Divider } from '@/components/ui/Divider';
import type { InvitationStatus } from '@/lib/types/invitation';

type InvitationView = {
  wsId: string;
  wsName: string;
  status: InvitationStatus;
};

type Props = {
  rfpId: string;
  invitations: InvitationView[];
  canEdit: boolean;
};

const statusLabel: Record<InvitationStatus, string> = {
  draft: '대기중',
  sent: '초대 보냄',
  opened: '열람',
  accepted: '수락',
  declined: '거절',
  expired: '만료',
};

const statusColor: Record<InvitationStatus, ChipColor> = {
  draft: 'surface',
  sent: 'surface',
  opened: 'warning',
  accepted: 'tertiary',
  declined: 'error',
  expired: 'surface',
};

export function RfpInviteManager({
  rfpId,
  invitations,
  canEdit,
}: Props) {
  const router = useRouter();
  const { pgList, loading: pgLoading, error: pgError, load: loadPg } = useLazyPgWorkspaces();
  const [inputError, setInputError] = useState('');
  const [pending, startTransition] = useTransition();

  // 추가 영역(canEdit)에서만 PG 목록을 불러온다. 트리거(팝오버)가 없어졌으므로
  // 마운트 시 eager-load. 비편집 RFP는 추가 영역이 없어 fetch 도 발생하지 않는다.
  // (훅 규칙상 effect 는 최상위에 두고 canEdit 으로 본문을 가드.)
  useEffect(() => {
    if (canEdit) loadPg();
  }, [canEdit, loadPg]);

  const draftCount = invitations.filter((i) => i.status === 'draft').length;
  const invitedIds = new Set(invitations.map((i) => i.wsId));
  const availablePgs = pgList.filter((pg) => !invitedIds.has(pg.id));

  const handleSelect = (ws: PgWorkspace) => {
    setInputError('');
    if (invitedIds.has(ws.id)) {
      setInputError('이미 추가된 워크스페이스입니다.');
      return;
    }
    startTransition(async () => {
      const r = await addPgWorkspacesToRfpAction({ rfpId, workspaceIds: [ws.id] });
      if (!r.ok) {
        toast(`추가하지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      router.refresh();
    });
  };

  const handleSendDrafts = () => {
    if (draftCount === 0) return;
    startTransition(async () => {
      const r = await sendDraftInvitationsAction({ rfpId });
      if (!r.ok) {
        toast(`초대 메일을 보내지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      toast(`${r.sentCount}개 PG에 초대 메일을 보냈어요.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* PG 목록 */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>초대 PG</Label>
          <Divider />
        </div>
        {invitations.length === 0 ? (
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
            초대한 PG가 없어요.
          </p>
        ) : (
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {invitations.map((inv, i) => (
              <div
                key={inv.wsId}
                className="py-2 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <CounterpartyProfileCard
                    variant="profile"
                    counterparty={{ name: inv.wsName, type: 'pg', workspaceId: inv.wsId }}
                  />
                </div>
                <Chip label={statusLabel[inv.status]} color={statusColor[inv.status]} />
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <>
          {/* PG 칩 추가 */}
          <div className="space-y-2">
            <Label size="md" muted={false}>PG 워크스페이스 추가</Label>

            {pgError ? (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
                {pgError}
              </p>
            ) : pgList.length === 0 ? (
              <p
                role="status"
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]"
              >
                불러오는 중…
              </p>
            ) : availablePgs.length === 0 ? (
              <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                모든 PG를 이미 추가했어요.
              </p>
            ) : (
              <div className="flex flex-wrap gap-[6px]">
                {availablePgs.map((pg) => (
                  <button
                    key={pg.id}
                    type="button"
                    disabled={pending}
                    onClick={() => handleSelect(pg)}
                    className="inline-flex items-center gap-1.5 py-[5px] pl-[5px] pr-3 rounded-[6px] text-[13px] bg-transparent text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)] disabled:opacity-50 transition-colors"
                  >
                    {/* 로고는 장식 — 칩 텍스트가 이미 PG명을 알리므로 a11y 트리에서 숨김 */}
                    <span aria-hidden className="inline-flex">
                      <WorkspaceAvatar
                        size="sm"
                        name={pg.name}
                        workspaceId={pg.id}
                        logoUpdatedAt={pg.logoUpdatedAt}
                      />
                    </span>
                    {pg.displayName}
                  </button>
                ))}
              </div>
            )}

            {inputError && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
                {inputError}
              </p>
            )}
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
              칩을 누르면 &ldquo;대기중&rdquo;으로 쌓여요. 아래 &ldquo;초대 보내기&rdquo;를
              누르면 메일이 나가요.
            </p>
          </div>

          {/* 초대 보내기 */}
          <div className="space-y-2">
            <Button
              type="button"
              fullWidth
              size="md"
              variant={draftCount > 0 ? 'filled' : 'text'}
              disabled={draftCount === 0 || pending}
              onClick={handleSendDrafts}
            >
              {pending && draftCount > 0
                ? '보내는 중…'
                : draftCount > 0
                  ? `${draftCount}개 PG에 초대 보내기`
                  : '보낼 대기 PG 없음'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인 (GREEN)**

Run: `pnpm test components/rfp/__tests__/RfpInviteManager.test.tsx`
Expected: PASS — 8개 테스트 모두 통과.

- [ ] **Step 5: 타입체크 + 린트**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 0. (특히 `chosungCommandFilter`/`getChoseong`/`Popover`/`Command*` 미사용 import 잔존 없음 — 위 전체 교체로 제거됨.)

- [ ] **Step 6: 커밋**

```bash
git add components/rfp/RfpInviteManager.tsx components/rfp/__tests__/RfpInviteManager.test.tsx
git commit -m "feat(rfp): PG 관리 PG 추가 UI를 드롭다운 검색에서 인라인 칩으로 전환

- Popover + cmdk 드롭다운 → WorkspaceAvatar 인라인 칩(위저드 RfpStep3PgSelect 스타일)
- 칩 클릭=즉시 추가, 이미 초대된 PG는 칩 풀에서 제외
- 죽은 chosungCommandFilter + 전용 테스트 제거, 마운트 시 PG 목록 eager-load
- 서버 액션·데이터·DB 불변(UI-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: e2e scenario-d 갱신 (칩 클릭)

**Files:**
- Modify: `e2e/scenario-d-buyer-add-pg.spec.ts:122-126`, `:213-217`

**Interfaces:**
- Consumes: Task 1의 칩 UI — 추가 가능한 PG는 `role="button"` + `name=<PG displayName>` 으로 렌더된다. `canEdit=false`면 'PG 워크스페이스 추가' 라벨/영역이 렌더되지 않는다.
- Produces: 없음(테스트 전용).

- [ ] **Step 1: happy-path 드롭다운 흐름을 칩 클릭으로 교체**

`e2e/scenario-d-buyer-add-pg.spec.ts`에서 현재 블록(line 122–126):

```ts
    // ── 3. Add a new PG workspace via Popover + cmdk ─────────────
    // Trigger lazy fetch (/api/workspaces/search?type=pg) and click the
    // newly seeded workspace by name.
    await page.getByRole('button', { name: 'PG사 검색…' }).click();
    await page.getByRole('option', { name: NEW_PG_NAME }).click();
```

를 아래로 교체한다:

```ts
    // ── 3. Add a new PG workspace by clicking its chip ───────────
    // 마운트 시 lazy fetch(/api/workspaces/search?type=pg)가 칩을 채운다.
    // 새로 시드된 워크스페이스는 칩 버튼으로 렌더되므로 바로 클릭한다.
    await page.getByRole('button', { name: NEW_PG_NAME }).click({ timeout: 15_000 });
```

(이후 step 4~6: '대기중' 칩·`초대 보내기`·DB 단언은 그대로 유지.)

- [ ] **Step 2: canEdit=false 단언을 추가 영역 부재로 교체**

같은 파일 두 번째 test의 블록(line 213–217):

```ts
      await page.goto(`/rfp/${RFP_ID}`);
      // canEdit=false → "PG사 검색…" trigger 자체가 렌더되지 않음.
      await expect(
        page.getByRole('button', { name: 'PG사 검색…' }),
      ).toHaveCount(0);
```

를 아래로 교체한다:

```ts
      await page.goto(`/rfp/${RFP_ID}`);
      // canEdit=false → 'PG 관리' 탭은 '초대 PG' 목록만 보이고
      // 'PG 워크스페이스 추가' 영역(칩 포함)은 통째로 숨김.
      await page.getByRole('tab', { name: 'PG 관리' }).click({ timeout: 15_000 });
      await expect(page.getByText('초대 PG')).toBeVisible();
      await expect(page.getByText('PG 워크스페이스 추가')).toHaveCount(0);
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 0. (e2e는 로컬 인프라 의존이라 단위처럼 즉시 실행하지 않고 CI에서 검증 — 프로젝트 관행. 변경은 컴파일/린트로 정합성만 확인.)

- [ ] **Step 4: 커밋**

```bash
git add e2e/scenario-d-buyer-add-pg.spec.ts
git commit -m "test(e2e): scenario-d PG 추가를 칩 클릭 흐름으로 갱신

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (스펙 §확정 결정 1–5, §아키텍처 1–5, §테스트 영향):
- 인라인 칩 + 검색 없음(결정 1) → Task 1 Step 3 칩 렌더, 검색 UI 없음. ✓
- 즉시 추가(결정 2) → `handleSelect` 그대로, 칩 클릭=액션 호출 테스트. ✓
- 초대된 PG 칩 풀에서 숨김(결정 3) → `availablePgs` 필터 + "제외" 테스트. ✓
- `chosungCommandFilter` 제거(결정 4/A) → 함수·import·전용 describe 삭제(Step 1/3), 린트로 검증(Step 5). ✓
- '전체 추가' 미포함(결정 5/B) → 칩 개별 클릭만, 일괄 버튼 없음. ✓
- eager-load(아키 2) → 최상위 `useEffect` + `canEdit` 가드. ✓
- 상태 처리(아키 4: 로딩/에러/빈 풀/추가중) → 4분기 + 각 테스트. ✓
- 단위 재작성 + e2e 갱신(테스트 영향) → Task 1/Task 2. ✓

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 스텝에 완전한 코드 포함. ✓

**3. Type consistency:**
- `useLazyPgWorkspaces` 반환 `{ pgList, loading, error, load }` — 훅·테스트 mock·컴포넌트 사용 일치. ✓
- `PgWorkspace = { id, name, displayName, logoUpdatedAt }` — `WorkspaceAvatar`에 `name`/`workspaceId=id`/`logoUpdatedAt` 매핑 일치, 칩 라벨 `displayName`. ✓
- `addPgWorkspacesToRfpAction({ rfpId, workspaceIds })` — 컴포넌트 호출·테스트 단언 동일. ✓
- 테스트 mock 핸들은 `vi.hoisted`로 선언해 `vi.mock` 팩토리 호이스팅 안전. ✓

**참고 함정(구현자):**
- 로딩 분기는 `pgList.length === 0`(에러 다음) 키 — 마운트 직후 데이터 도착 전 "추가할 PG 없음" 깜빡임을 막는다. 진짜 빈 디렉터리(정규 PG 0개)는 실무상 없음.
- 테스트 mock의 `pgList`는 `name`/`displayName` 동일값이라 `getByRole('button', { name })` 가 칩 텍스트(displayName)로 매칭. 아바타는 `aria-hidden`이라 접근명 오염 없음.
