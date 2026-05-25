# Workspace Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 워크스페이스 이름에서 이니셜·색상을 자동 생성해 사이드바(접힘/펼침)와 워크스페이스 전환 드롭다운에 아이콘으로 표시한다.

**Architecture:** `lib/utils/workspace-avatar.ts`에 순수 함수(`getWorkspaceInitials`, `getWorkspaceColor`)를 두고, `WorkspaceAvatar` 컴포넌트가 이를 소비해 정사각형 아이콘을 렌더링한다. `WorkspaceSwitcher`가 컴포넌트를 3곳(접힘 트리거, 펼침 트리거, 드롭다운 항목)에 삽입한다. 스키마·서버·타입 변경 없음.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Vitest (pnpm test)

---

## File Map

| 역할 | 파일 | 액션 |
|---|---|---|
| 순수 유틸 | `lib/utils/workspace-avatar.ts` | 신규 |
| 유틸 테스트 | `__tests__/workspace-avatar.test.ts` | 신규 |
| 아바타 컴포넌트 | `components/primitives/WorkspaceAvatar.tsx` | 신규 |
| 사이드바 스위처 | `components/shell/WorkspaceSwitcher.tsx` | 수정 |

---

## Task 1: `workspace-avatar.ts` — 실패 테스트 작성

**Files:**
- Create: `__tests__/workspace-avatar.test.ts`

- [ ] **Step 1: 테스트 파일 생성**

```ts
// __tests__/workspace-avatar.test.ts
import { describe, it, expect } from 'vitest';
import {
  getWorkspaceInitials,
  getWorkspaceColor,
  WORKSPACE_AVATAR_COLORS,
} from '@/lib/utils/workspace-avatar';

describe('getWorkspaceInitials', () => {
  it('단어 1개 → 첫 글자', () => {
    expect(getWorkspaceInitials('토스페이먼츠')).toBe('토');
  });
  it('단어 2개 → 각 첫 글자', () => {
    expect(getWorkspaceInitials('토스 페이먼츠')).toBe('토페');
  });
  it('영어 대문자 변환', () => {
    expect(getWorkspaceInitials('abc pay')).toBe('AP');
  });
  it('영어 단어 2개 → 두 이니셜', () => {
    expect(getWorkspaceInitials('ABC Pay')).toBe('AP');
  });
  it('공백 없는 영어 단어 → 첫 글자만', () => {
    expect(getWorkspaceInitials('NHN페이코')).toBe('N');
  });
  it('(주) 접두어 제거', () => {
    expect(getWorkspaceInitials('(주)토스페이먼츠')).toBe('토');
  });
  it('(유) 접두어 제거', () => {
    expect(getWorkspaceInitials('(유)나이스페이먼츠')).toBe('나');
  });
  it('(합) 접두어 제거', () => {
    expect(getWorkspaceInitials('(합)테스트')).toBe('테');
  });
  it('(사) 접두어 제거', () => {
    expect(getWorkspaceInitials('(사)테스트')).toBe('테');
  });
  it('(재) 접두어 제거', () => {
    expect(getWorkspaceInitials('(재)테스트')).toBe('테');
  });
  it('접두어 뒤 공백 처리', () => {
    expect(getWorkspaceInitials('(주) 토스페이먼츠')).toBe('토');
  });
  it('빈 문자열 → ?', () => {
    expect(getWorkspaceInitials('')).toBe('?');
  });
  it('공백만 → ?', () => {
    expect(getWorkspaceInitials('   ')).toBe('?');
  });
  it('접두어만 → ?', () => {
    expect(getWorkspaceInitials('(주)')).toBe('?');
  });
});

describe('getWorkspaceColor', () => {
  it('WORKSPACE_AVATAR_COLORS 배열 내 항목 반환', () => {
    const color = getWorkspaceColor('토스페이먼츠');
    expect(WORKSPACE_AVATAR_COLORS).toContain(color);
  });
  it('동일 이름은 항상 동일 색상', () => {
    expect(getWorkspaceColor('토스')).toBe(getWorkspaceColor('토스'));
  });
  it('빈 문자열도 크래시 없음', () => {
    expect(() => getWorkspaceColor('')).not.toThrow();
  });
  it('반환값이 bg/fg 키를 가짐', () => {
    const color = getWorkspaceColor('카카오페이');
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('fg');
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
pnpm test __tests__/workspace-avatar.test.ts
```

Expected: `Cannot find module '@/lib/utils/workspace-avatar'` 오류로 실패.

---

## Task 2: `workspace-avatar.ts` — 구현

**Files:**
- Create: `lib/utils/workspace-avatar.ts`

- [ ] **Step 1: 유틸 파일 생성**

```ts
// lib/utils/workspace-avatar.ts

export type WorkspaceAvatarColor = { bg: string; fg: string };

export const WORKSPACE_AVATAR_COLORS: WorkspaceAvatarColor[] = [
  { bg: '#162236', fg: '#6aadff' }, // blue
  { bg: '#231a45', fg: '#b59fff' }, // purple
  { bg: '#0e2e25', fg: '#4fd1a8' }, // teal
  { bg: '#2a1a10', fg: '#f5a05a' }, // orange
  { bg: '#2e1029', fg: '#f07bb8' }, // pink
  { bg: '#1c2030', fg: '#8aabcf' }, // slate
];

const LEGAL_PREFIX_RE = /^\([주유합사재]\)\s*/;

export function getWorkspaceInitials(name: string): string {
  const stripped = name.replace(LEGAL_PREFIX_RE, '').trim();
  if (!stripped) return '?';
  const words = stripped.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return words[0][0].toUpperCase();
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // unsigned 32-bit
  }
  return hash;
}

export function getWorkspaceColor(name: string): WorkspaceAvatarColor {
  const idx = djb2(name) % WORKSPACE_AVATAR_COLORS.length;
  return WORKSPACE_AVATAR_COLORS[idx];
}
```

- [ ] **Step 2: 테스트 실행 — GREEN 확인**

```bash
pnpm test __tests__/workspace-avatar.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 3: 커밋**

```bash
git add lib/utils/workspace-avatar.ts __tests__/workspace-avatar.test.ts
git commit -m "feat(workspace): 이니셜·색상 유틸 추가 (TDD)"
```

---

## Task 3: `WorkspaceAvatar` 컴포넌트

TDD 면제 — 순수 시각/렌더링 컴포넌트.

**Files:**
- Create: `components/primitives/WorkspaceAvatar.tsx`

- [ ] **Step 1: 컴포넌트 파일 생성**

```tsx
// components/primitives/WorkspaceAvatar.tsx
import { cn } from '@/lib/utils';
import { getWorkspaceInitials, getWorkspaceColor } from '@/lib/utils/workspace-avatar';

type Props = { name: string; size?: 'sm' | 'md'; className?: string };

const sizeMap = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-7 h-7 text-[11px]',
};

export function WorkspaceAvatar({ name, size = 'sm', className }: Props) {
  const initials = getWorkspaceInitials(name);
  const color = getWorkspaceColor(name);
  return (
    <div
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center shrink-0',
        'rounded-[var(--md-sys-shape-extra-small)]',
        'font-[number:var(--md-typescale-label-large-weight)] select-none',
        sizeMap[size],
        className,
      )}
      style={{ background: color.bg, color: color.fg }}
    >
      {initials}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm tsc --noEmit
```

Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
git add components/primitives/WorkspaceAvatar.tsx
git commit -m "feat(workspace): WorkspaceAvatar 컴포넌트 추가"
```

---

## Task 4: `WorkspaceSwitcher` — 아이콘 통합

TDD 면제 — 시각 레이아웃 수정.

**Files:**
- Modify: `components/shell/WorkspaceSwitcher.tsx`

현재 파일 전체를 아래로 교체한다. 변경 포인트 3곳:
1. `WorkspaceAvatar` import 추가
2. 트리거에 `<WorkspaceAvatar>` 삽입, `ChevronsUpDownIcon`에 `group-data-[collapsible=icon]:hidden` 추가
3. 드롭다운 항목에 `<WorkspaceAvatar>` 삽입

- [ ] **Step 1: `WorkspaceSwitcher.tsx` 수정**

```tsx
// components/shell/WorkspaceSwitcher.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDownIcon, CheckIcon, PlusIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Chip } from '@/components/primitives/Chip';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';
import type {
  WorkspaceMembershipSummary,
  WorkspaceType,
} from '@/lib/types/workspace';

const TYPE_LABEL: Record<WorkspaceType, string> = { buyer: '구매사', pg: 'PG' };

type Props = {
  current: { id: string; name: string; type: WorkspaceType };
  workspaces: WorkspaceMembershipSummary[];
};

export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; type: WorkspaceType } | null>(null);

  async function handleSelect(id: string) {
    if (id === current.id || busy) return;
    const target = workspaces.find((w) => w.id === id);
    if (!target) return;
    setPending({ name: target.name, type: target.type });
    setBusy(true);
    const r = await switchWorkspaceAction(id);
    if (r.ok) {
      window.location.assign(r.redirectTo);
    } else {
      setPending(null);
      setBusy(false);
    }
  }

  const display = pending ?? current;

  const itemCls =
    'flex items-center gap-2 px-2 py-1.5 rounded-[var(--md-sys-shape-extra-small)] cursor-pointer text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        aria-busy={busy}
        className={`flex h-9 w-full min-w-0 flex-nowrap items-center justify-start gap-2 rounded-[var(--md-sys-shape-extra-small)] px-2 hover:bg-[var(--md-sys-color-surface-container-high)] outline-none transition-[color,background-color,opacity] duration-[140ms] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0${busy ? ' opacity-60' : ''}`}
      >
        {/* 접힘/펼침 모두 표시. 접힘 시 이 아이콘만 남음 */}
        <WorkspaceAvatar name={display.name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:sr-only">
          {display.name}
        </span>
        <Chip
          label={TYPE_LABEL[display.type]}
          color="surface"
          className="h-6 shrink-0 whitespace-nowrap px-2 group-data-[collapsible=icon]:hidden"
        />
        {/* 접힘 상태에서는 chevron 숨김 — 아바타만 남아 아이콘 역할 */}
        <ChevronsUpDownIcon
          size={14}
          className="shrink-0 text-[var(--md-sys-color-on-surface-variant)] group-data-[collapsible=icon]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-[var(--shell-sidebar)] min-w-[var(--shell-sidebar)] rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-1 shadow-[var(--md-sys-elevation-2)]"
      >
        <div className="px-2 py-1.5 text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
          내 워크스페이스
        </div>
        {workspaces.map((ws) => {
          const active = ws.id === current.id;
          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => handleSelect(ws.id)}
              className={itemCls}
            >
              <span className="w-4 shrink-0 text-[var(--md-sys-color-primary)]">
                {active && <CheckIcon size={14} />}
              </span>
              <WorkspaceAvatar name={ws.name} size="sm" />
              <span className="flex-1 truncate">{ws.name}</span>
              <span className="shrink-0 text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
                {TYPE_LABEL[ws.type]}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-[var(--md-sys-color-outline-variant)]" />
        <DropdownMenuItem onClick={() => router.push('/workspace/new')} className={itemCls}>
          <PlusIcon size={14} className="shrink-0" />
          워크스페이스 만들기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm tsc --noEmit
```

Expected: 오류 없음.

- [ ] **Step 3: 전체 테스트**

```bash
pnpm test
```

Expected: 모든 테스트 PASS (Task 2에서 작성한 workspace-avatar 테스트 포함).

- [ ] **Step 4: 커밋**

```bash
git add components/shell/WorkspaceSwitcher.tsx
git commit -m "feat(shell): 워크스페이스 아이콘을 사이드바·드롭다운에 표시"
```

---

## Verification

로컬 개발 서버를 띄워 아래 시나리오를 직접 확인한다.

```bash
pnpm dev
```

1. **접힘 상태**: 사이드바를 접었을 때 워크스페이스 트리거 자리에 이니셜 아바타가 표시되고 ChevronsUpDownIcon이 사라진다.
2. **펼침 상태**: 사이드바를 펼쳤을 때 트리거 왼쪽에 아바타, 오른쪽에 이름·타입칩·chevron이 나란히 표시된다.
3. **드롭다운**: 트리거 클릭 시 각 워크스페이스 항목 왼쪽에 해당 이니셜·색상 아바타가 표시된다.
4. **`(주)` 이름**: 워크스페이스 이름이 `(주)토스페이먼츠`인 경우 아바타 이니셜이 `(`가 아닌 `토`로 표시된다.
5. **색상 일관성**: 페이지를 새로고침해도 동일 워크스페이스는 항상 같은 색상이 나온다.
