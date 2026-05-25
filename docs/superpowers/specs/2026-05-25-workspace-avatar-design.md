# Workspace Avatar Design

**Date:** 2026-05-25  
**Status:** Approved

## Problem

사이드바가 접혔을 때 `WorkspaceSwitcher` 트리거에는 `ChevronsUpDownIcon`만 표시되어 현재 워크스페이스를 식별할 수 없다. 펼쳐진 상태에서도 워크스페이스를 시각적으로 구별할 아이콘이 없다.

## Solution

워크스페이스 이름에서 **이니셜 + 색상을 자동 생성**하는 `WorkspaceAvatar` 컴포넌트를 도입한다. 스키마·서버 레이어 변경 없이 클라이언트에서 완전 계산한다.

---

## Architecture

### New files

#### `lib/utils/workspace-avatar.ts`
순수 유틸리티 함수 2개. 테스트 대상.

```ts
export function getWorkspaceInitials(name: string): string
export function getWorkspaceColor(name: string): WorkspaceAvatarColor
export type WorkspaceAvatarColor = { bg: string; fg: string }
```

#### `components/primitives/WorkspaceAvatar.tsx`
`name: string`을 받아 이니셜 + 색상을 계산하고 독립적인 div를 렌더링.  
기존 `Avatar` 컴포넌트를 래핑하지 않음 — Avatar는 `shape-full`(pill) 반지름과 MD CSS 변수 색상을 사용하지만, WorkspaceAvatar는 `shape-extra-small`(6px) 정사각형 + hex 전용 팔레트가 필요하기 때문.

```tsx
type Props = { name: string; size?: 'sm' | 'md'; className?: string }
export function WorkspaceAvatar({ name, size = 'sm', className }: Props)
// sm: w-6 h-6 (24px), md: w-7 h-7 (28px)
// border-radius: var(--md-sys-shape-extra-small)  ← 6px 정사각형
```

### Modified files

#### `components/shell/WorkspaceSwitcher.tsx`
- 트리거 (접힘): `ChevronsUpDownIcon` 대신 `WorkspaceAvatar`
- 트리거 (펼침): 이름 왼쪽에 `WorkspaceAvatar` 추가, chevron 유지
- 드롭다운 항목: 체크 오른쪽에 `WorkspaceAvatar` 삽입

---

## Algorithms

### `getWorkspaceInitials(name)`

1. 법인 접두어 제거: regex `/^\([주유합사재]\)\s*/`
2. trim 후 빈 문자열 → `"?"`
3. 공백으로 분리
   - 2개 이상 단어 → 첫 두 단어의 첫 글자 (예: `"토스 페이"` → `"토페"`, `"ABC Pay"` → `"AP"`)
   - 1개 단어 → 첫 글자만 (예: `"토스페이먼츠"` → `"토"`)
4. 대문자 변환

| 입력 | 출력 |
|---|---|
| `"토스페이먼츠"` | `"토"` |
| `"(주)토스페이먼츠"` | `"토"` |
| `"(유)나이스페이먼츠"` | `"나"` |
| `"토스 페이먼츠"` | `"토페"` |
| `"NHN페이코"` | `"N"` |
| `"ABC Pay"` | `"AP"` |
| `"(주)"` | `"?"` |

### `getWorkspaceColor(name)`

djb2 해시 → 6색 팔레트에서 mod 6 선택.

```ts
const WORKSPACE_AVATAR_COLORS = [
  { bg: '#162236', fg: '#6aadff' }, // blue
  { bg: '#231a45', fg: '#b59fff' }, // purple
  { bg: '#0e2e25', fg: '#4fd1a8' }, // teal
  { bg: '#2a1a10', fg: '#f5a05a' }, // orange
  { bg: '#2e1029', fg: '#f07bb8' }, // pink
  { bg: '#1c2030', fg: '#8aabcf' }, // slate
]
```

기존 `Avatar` 컴포넌트의 `AvatarColor` 타입(`primary`/`secondary` 등 MD 시스템 색상)과 독립적인 전용 팔레트. `WorkspaceAvatar`는 `style={{ background: color.bg, color: color.fg }}`로 직접 적용한다.

---

## UI Changes

### Collapsed sidebar

```
[ 아바타 22px ]   ← ChevronsUpDownIcon 대체
                   트리거 자체는 32px 유지 (group-data-[collapsible=icon]:size-8)
```

### Expanded sidebar

```
[ 아바타 22px ]  워크스페이스 이름  [ PG ]  ⌄
```

- chevron(`ChevronsUpDownIcon`)은 접힘 상태에서 숨김 (`group-data-[collapsible=icon]:hidden`)
- 아바타는 항상 표시

### Dropdown items

```
✓  [ 아바타 ]  토스페이먼츠  PG
   [ 아바타 ]  카카오페이    PG
   [ 아바타 ]  나이스페이먼츠  PG
```

---

## Data Flow

변경 없음. `WorkspaceSwitcher`는 이미 `current.name`과 `workspaces[].name`을 받고 있으므로 `WorkspaceAvatar name={ws.name}`으로 바로 사용 가능.

---

## Testing

### TDD 대상: `lib/utils/workspace-avatar.ts`

`__tests__/workspace-avatar.test.ts` 작성 (RED 먼저):

```ts
// getWorkspaceInitials
"토스페이먼츠"         → "토"
"(주)토스페이먼츠"     → "토"
"(유)나이스페이먼츠"   → "나"
"토스 페이먼츠"        → "토페"
"NHN페이코"           → "N"
"ABC Pay"             → "AP"
"(주)"                → "?"
"   "                 → "?"

// getWorkspaceColor
동일 이름은 항상 동일 색상 반환
빈 문자열도 크래시 없이 동작
반환값이 WORKSPACE_AVATAR_COLORS 배열 내 항목임을 확인
```

### TDD 면제: `WorkspaceAvatar.tsx`, `WorkspaceSwitcher.tsx` UI 변경
순수 스타일/렌더링 변경 — CLAUDE.md TDD 면제 조건 해당.

---

## Out of Scope

- 아이콘 수동 설정 UI (생성/편집 폼) — 완전 자동 생성으로 불필요
- 스키마 변경 — 없음
- 이미지 업로드 — v0 제외
