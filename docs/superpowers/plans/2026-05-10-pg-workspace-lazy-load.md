# PG 워크스페이스 Lazy Load + cmdk 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RFP 작성/편집 화면에서 PG 워크스페이스 선택 시 키 입력마다 API를 호출하는 방식 대신, 첫 드롭다운 열람 시 전체 목록을 1회 fetch하고 이후 클라이언트에서 cmdk로 필터링한다.

**Architecture:** `/api/workspaces/search`의 `q` 파라미터를 선택적으로 변경 → `useLazyPgWorkspaces` 훅이 첫 `load()` 호출 시에만 전체 fetch → `RfpCreateForm`·`RfpInviteManager` 두 컴포넌트의 커스텀 드롭다운을 Radix Popover + cmdk Command로 교체.

**Tech Stack:** Next.js App Router, TypeScript, `@radix-ui/react-popover@^1.1.15`, `cmdk@^1.1.1`, Tailwind v4 + MD3 CSS 변수

---

### Task 1: API route — `q` 파라미터 선택적으로 변경

**Files:**
- Modify: `app/api/workspaces/search/route.ts`

- [ ] **Step 1: `QuerySchema`의 `q`를 optional로 변경하고, 전체 조회 시 limit 올리기**

  `app/api/workspaces/search/route.ts` 전체를 아래로 교체:

  ```ts
  /**
   * GET /api/workspaces/search?q=&type=pg
   *
   * PG 워크스페이스 이름 검색 endpoint. q 없이 호출하면 전체 목록 반환(최대 500건).
   * runtime='nodejs' — postgres-js는 Node-only.
   */
  import { NextRequest, NextResponse } from 'next/server';
  import { z } from 'zod';
  import { eq, ilike, and } from 'drizzle-orm';

  import { auth } from '@/auth';
  import { db } from '@/lib/db/client';
  import { workspaces } from '@/lib/db/schema';

  export const runtime = 'nodejs';
  export const dynamic = 'force-dynamic';

  const QuerySchema = z.object({
    q: z.string().max(100).optional(),
    type: z.enum(['buyer', 'pg']).default('pg'),
  });

  function escapeIlike(s: string): string {
    return s.replace(/[\\%_]/g, '\\$&');
  }

  export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const parsed = QuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      type: searchParams.get('type') ?? 'pg',
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_INPUT', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { q, type } = parsed.data;

    if (type === 'buyer') {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      }
    }

    const rows = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(
        q
          ? and(eq(workspaces.type, type), ilike(workspaces.name, `%${escapeIlike(q)}%`))
          : eq(workspaces.type, type),
      )
      .limit(q ? 20 : 500);

    const nameCount = new Map<string, number>();
    for (const row of rows) {
      nameCount.set(row.name, (nameCount.get(row.name) ?? 0) + 1);
    }

    const result = rows.map((row) => ({
      id: row.id,
      name: row.name,
      displayName:
        (nameCount.get(row.name) ?? 1) > 1
          ? `${row.name} #${row.id.slice(0, 8)}`
          : row.name,
    }));

    return NextResponse.json({ workspaces: result });
  }
  ```

- [ ] **Step 2: 타입 체크**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: 오류 없음.

- [ ] **Step 3: 커밋**

  ```bash
  git add app/api/workspaces/search/route.ts
  git commit -m "feat(api): make q optional in /api/workspaces/search — returns all pg when omitted"
  ```

---

### Task 2: `useLazyPgWorkspaces` 훅 생성

**Files:**
- Create: `hooks/useLazyPgWorkspaces.ts`

- [ ] **Step 1: 훅 파일 생성**

  `hooks/useLazyPgWorkspaces.ts`:

  ```ts
  'use client';

  import { useState, useRef, useCallback } from 'react';

  export type PgWorkspace = { id: string; name: string; displayName: string };

  export function useLazyPgWorkspaces() {
    const [pgList, setPgList] = useState<PgWorkspace[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadedRef = useRef(false);

    const load = useCallback(async () => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/workspaces/search?type=pg');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { workspaces: PgWorkspace[] };
        setPgList(data.workspaces);
      } catch {
        loadedRef.current = false;
        setError('불러오기 실패. 다시 시도해주세요.');
      } finally {
        setLoading(false);
      }
    }, []);

    return { pgList, loading, error, load };
  }
  ```

- [ ] **Step 2: 타입 체크**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: 오류 없음.

- [ ] **Step 3: 커밋**

  ```bash
  git add hooks/useLazyPgWorkspaces.ts
  git commit -m "feat: add useLazyPgWorkspaces hook — lazy fetch all pg workspaces once"
  ```

---

### Task 3: `RfpCreateForm` — cmdk Combobox 적용

**Files:**
- Modify: `components/rfp/RfpCreateForm.tsx`

현재 PG 검색 관련 상태: `wsQuery`, `wsResults`, `isSearching`, `showDropdown`, `wsInputError`, `dropdownRef`, `searchTimerRef`.  
제거 대상: `wsQuery`, `wsResults`, `isSearching`, `showDropdown`, `dropdownRef`, `searchTimerRef`, click-outside `useEffect`, `handleWsQueryChange`.  
유지: `wsInputError`, `handleWsSelect` (간소화), `handleWsRemove`.

- [ ] **Step 1: import 교체**

  파일 상단 import 블록을 아래로 교체:

  ```ts
  'use client';

  import { useCallback, useState } from 'react';
  import { useRouter } from 'next/navigation';
  import * as Popover from '@radix-ui/react-popover';
  import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk';
  import { Button } from '@/components/primitives/Button';
  import { Label } from '@/components/primitives/Label';
  import { RfpAttachmentDropzone } from './RfpAttachmentDropzone';
  import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
  import { useLazyPgWorkspaces } from '@/hooks/useLazyPgWorkspaces';
  import type { PgWorkspace } from '@/hooks/useLazyPgWorkspaces';
  import { useShortcut } from '@/lib/hooks/useShortcut';
  import { createRfpAction } from '@/lib/server/actions/rfp';
  import type { BizProfile } from '@/lib/types/biz-profile';
  ```

- [ ] **Step 2: 컴포넌트 상태 교체**

  `export function RfpCreateForm(...)` 함수 본문에서 기존 workspace search 관련 state/ref/effect를 모두 제거하고 아래로 교체:

  기존 (제거):
  ```ts
  const [wsQuery, setWsQuery] = useState('');
  const [wsResults, setWsResults] = useState<PgWorkspaceItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [wsInputError, setWsInputError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  ```

  추가 (삽입):
  ```ts
  const { pgList, loading: pgLoading, error: pgError, load: loadPg } = useLazyPgWorkspaces();
  const [pgOpen, setPgOpen] = useState(false);
  const [wsInputError, setWsInputError] = useState('');
  ```

- [ ] **Step 3: `handleWsQueryChange` 제거, `handleWsSelect` 간소화**

  기존 `handleWsQueryChange` 함수 전체 삭제.

  기존 `handleWsSelect`:
  ```ts
  const handleWsSelect = (ws: PgWorkspaceItem) => {
    setShowDropdown(false);
    setWsQuery('');
    setWsResults([]);
    setWsInputError('');

    if (draft.allowedPgWorkspaceIds.some((w) => w.id === ws.id)) {
      setWsInputError('이미 추가된 워크스페이스입니다.');
      return;
    }

    draft.setField('allowedPgWorkspaceIds', [...draft.allowedPgWorkspaceIds, ws]);
  };
  ```

  교체 후:
  ```ts
  const handleWsSelect = (ws: PgWorkspace) => {
    setWsInputError('');
    if (draft.allowedPgWorkspaceIds.some((w) => w.id === ws.id)) {
      setWsInputError('이미 추가된 워크스페이스입니다.');
      return;
    }
    draft.setField('allowedPgWorkspaceIds', [...draft.allowedPgWorkspaceIds, ws]);
  };
  ```

- [ ] **Step 4: JSX — 검색 섹션 교체**

  `{/* 03 PG 워크스페이스 */}` 섹션 안의 `{/* 검색 input */}` 부분 (현재 `<div ref={dropdownRef} className="relative">` 블록 전체)을 아래로 교체:

  ```tsx
  {/* PG 검색 combobox */}
  <Popover.Root
    open={pgOpen}
    onOpenChange={(v) => {
      setPgOpen(v);
      if (v) loadPg();
    }}
  >
    <Popover.Trigger asChild>
      <button
        type="button"
        className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-left text-[14px] text-[var(--md-sys-color-outline)] hover:border-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
      >
        PG사 검색…
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={4}
        className="z-50 w-[var(--radix-popover-trigger-width)] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-md shadow-sm overflow-hidden"
      >
        <Command>
          <CommandInput
            placeholder="PG사 이름 검색"
            className="w-full bg-transparent px-3 py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none border-b border-[var(--md-sys-color-outline-variant)]"
          />
          <CommandList className="max-h-[200px] overflow-y-auto">
            <CommandEmpty className="py-2 px-3 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
              {pgLoading ? 'LOADING…' : pgError ?? '결과 없음'}
            </CommandEmpty>
            {pgList.map((pg) => {
              const alreadyAdded = draft.allowedPgWorkspaceIds.some((w) => w.id === pg.id);
              return (
                <CommandItem
                  key={pg.id}
                  value={pg.displayName}
                  disabled={alreadyAdded}
                  onSelect={() => {
                    handleWsSelect(pg);
                    setPgOpen(false);
                  }}
                  className="px-3 py-2 text-[13px] text-[var(--md-sys-color-on-surface)] data-[selected=true]:bg-[var(--md-sys-color-surface-container-high)] aria-disabled:opacity-40 cursor-pointer"
                >
                  {pg.displayName}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  ```

- [ ] **Step 5: 타입 체크 + 린트**

  ```bash
  pnpm tsc --noEmit && pnpm lint
  ```

  Expected: 오류 없음. `PgWorkspaceItem` import 잔재가 있으면 삭제.

- [ ] **Step 6: 커밋**

  ```bash
  git add components/rfp/RfpCreateForm.tsx
  git commit -m "feat(rfp): replace debounced search with lazy-load cmdk combobox in RfpCreateForm"
  ```

---

### Task 4: `RfpInviteManager` — cmdk Combobox 적용

**Files:**
- Modify: `components/rfp/RfpInviteManager.tsx`

현재 PG 검색 관련 상태: `query`, `results`, `isSearching`, `showDropdown`, `inputError`, `dropdownRef`, `searchTimerRef`.  
제거: `query`, `results`, `isSearching`, `showDropdown`, `dropdownRef`, `searchTimerRef`, click-outside `useEffect`, `handleQueryChange`.  
유지: `inputError`, `handleSelect` (간소화), `pending`/`startTransition` (서버 액션에 여전히 사용됨).

- [ ] **Step 1: import 교체**

  파일 상단 import 블록을 아래로 교체:

  ```ts
  'use client';

  import { useState, useTransition } from 'react';
  import { useRouter } from 'next/navigation';
  import * as Popover from '@radix-ui/react-popover';
  import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk';
  import { Button } from '@/components/primitives/Button';
  import { Label } from '@/components/primitives/Label';
  import { Chip } from '@/components/primitives/Chip';
  import type { ChipColor } from '@/components/primitives/Chip';
  import {
    addPgWorkspacesToRfpAction,
    sendDraftInvitationsAction,
  } from '@/lib/server/actions/rfp';
  import { useLazyPgWorkspaces } from '@/hooks/useLazyPgWorkspaces';
  import type { PgWorkspace } from '@/hooks/useLazyPgWorkspaces';
  import { toast } from '@/lib/toast';
  import type { InvitationStatus } from '@/lib/types/invitation';
  ```

  기존 로컬 `WsSearchResult` 타입 선언 삭제.

- [ ] **Step 2: 컴포넌트 상태 교체**

  `export function RfpInviteManager(...)` 함수 본문에서 기존 search 관련 state/ref/effect 제거하고 교체:

  기존 (제거):
  ```ts
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WsSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputError, setInputError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  ```

  추가 (삽입):
  ```ts
  const { pgList, loading: pgLoading, error: pgError, load: loadPg } = useLazyPgWorkspaces();
  const [pgOpen, setPgOpen] = useState(false);
  const [inputError, setInputError] = useState('');
  ```

- [ ] **Step 3: `handleQueryChange` 제거, `handleSelect` 간소화**

  기존 `handleQueryChange` 함수 전체 삭제.

  기존 `handleSelect`:
  ```ts
  const handleSelect = (ws: WsSearchResult) => {
    setShowDropdown(false);
    setQuery('');
    setResults([]);
    setInputError('');

    if (invitations.some((i) => i.wsId === ws.id)) {
      setInputError('이미 추가된 워크스페이스입니다.');
      return;
    }

    startTransition(async () => {
      const r = await addPgWorkspacesToRfpAction({ rfpId, workspaceIds: [ws.id] });
      if (!r.ok) {
        toast(`추가 실패 — ${r.error}`, { type: 'error' });
        return;
      }
      router.refresh();
    });
  };
  ```

  교체 후:
  ```ts
  const handleSelect = (ws: PgWorkspace) => {
    setInputError('');
    if (invitations.some((i) => i.wsId === ws.id)) {
      setInputError('이미 추가된 워크스페이스입니다.');
      return;
    }
    startTransition(async () => {
      const r = await addPgWorkspacesToRfpAction({ rfpId, workspaceIds: [ws.id] });
      if (!r.ok) {
        toast(`추가 실패 — ${r.error}`, { type: 'error' });
        return;
      }
      router.refresh();
    });
  };
  ```

- [ ] **Step 4: JSX — 검색 섹션 교체**

  `{canEdit && (...)}` 블록 안 `{/* PG 검색 추가 */}` 섹션의 `<div ref={dropdownRef} className="relative">` 블록 전체를 아래로 교체:

  ```tsx
  <Popover.Root
    open={pgOpen}
    onOpenChange={(v) => {
      setPgOpen(v);
      if (v) loadPg();
    }}
  >
    <Popover.Trigger asChild>
      <button
        type="button"
        disabled={pending}
        className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-left text-[14px] text-[var(--md-sys-color-outline)] hover:border-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors disabled:opacity-50"
      >
        PG사 검색…
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={4}
        className="z-50 w-[var(--radix-popover-trigger-width)] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-md shadow-sm overflow-hidden"
      >
        <Command>
          <CommandInput
            placeholder="PG사 이름 검색"
            className="w-full bg-transparent px-3 py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none border-b border-[var(--md-sys-color-outline-variant)]"
          />
          <CommandList className="max-h-[200px] overflow-y-auto">
            <CommandEmpty className="py-2 px-3 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
              {pgLoading ? 'LOADING…' : pgError ?? '결과 없음'}
            </CommandEmpty>
            {pgList.map((pg) => {
              const alreadyAdded = invitations.some((i) => i.wsId === pg.id);
              return (
                <CommandItem
                  key={pg.id}
                  value={pg.displayName}
                  disabled={alreadyAdded}
                  onSelect={() => {
                    handleSelect(pg);
                    setPgOpen(false);
                  }}
                  className="px-3 py-2 text-[13px] text-[var(--md-sys-color-on-surface)] data-[selected=true]:bg-[var(--md-sys-color-surface-container-high)] aria-disabled:opacity-40 cursor-pointer"
                >
                  {pg.displayName}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  ```

- [ ] **Step 5: 타입 체크 + 린트**

  ```bash
  pnpm tsc --noEmit && pnpm lint
  ```

  Expected: 오류 없음.

- [ ] **Step 6: 커밋**

  ```bash
  git add components/rfp/RfpInviteManager.tsx
  git commit -m "feat(rfp): replace debounced search with lazy-load cmdk combobox in RfpInviteManager"
  ```

---

### Task 5: 최종 검증

- [ ] **Step 1: 전체 빌드 타입 체크**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: 오류 없음.

- [ ] **Step 2: 브라우저 검증 — RFP 작성 (`/rfp/new`)**

  1. `/rfp/new` 접속
  2. "초대할 PG 워크스페이스" 섹션의 "PG사 검색…" 버튼 클릭
  3. 드롭다운이 열리면서 `LOADING…` 표시 후 전체 PG 목록 로드 확인
  4. 텍스트 입력 시 클라이언트 필터링 동작 확인 (네트워크 탭에 추가 API 요청 없음)
  5. 항목 선택 후 목록에 추가됨 확인
  6. 같은 항목 재선택 시 비활성화(opacity 감소) 확인
  7. 드롭다운 재열람 시 `LOADING…` 없이 즉시 목록 표시 (캐시 동작)

- [ ] **Step 3: 브라우저 검증 — RFP 상세 (`/rfp/[id]`)**

  1. 기존 RFP 상세 페이지 접속 (status=sent인 RFP)
  2. `RfpInviteManager`의 "PG사 검색…" 버튼 클릭
  3. 동일 동작 확인 (로드, 필터링, 중복 비활성화)
  4. 항목 선택 후 `addPgWorkspacesToRfpAction` 호출 및 페이지 새로고침 확인

- [ ] **Step 4: 최종 커밋 (변경 없으면 생략)**

  검증 중 발견한 마이너 수정이 있을 경우만:

  ```bash
  git add -p
  git commit -m "fix(rfp): post-verification adjustments for pg lazy-load combobox"
  ```
