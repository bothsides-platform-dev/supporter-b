# Workspace Avatar Theme Adaptation Design

**Date:** 2026-05-25  
**Status:** Approved

## Problem

`WORKSPACE_AVATAR_COLORS`에 하드코딩된 hex 값들이 다크모드 기준으로 설계되어 라이트모드 사이드바(`#F7F8F9` 배경)에서 어색하게 보인다.

## Solution

기존 `tokens.css` 패턴을 따라 CSS 변수 12개(6색 × bg/fg)를 추가한다. 라이트값은 `@theme` 블록, 다크값은 `.dark {}` 블록에 선언. `WORKSPACE_AVATAR_COLORS`는 hex 대신 이 변수를 참조하도록 변경. `WorkspaceAvatar` 컴포넌트와 테스트는 변경 없음.

---

## Changes

### 1. `styles/tokens.css`

`@theme` 블록 끝에 라이트 팔레트 추가:

```css
/* Workspace avatar — 라이트 팔레트 */
--workspace-avatar-blue-bg:   #D8EAFF;  --workspace-avatar-blue-fg:   #003258;
--workspace-avatar-purple-bg: #E8E0FF;  --workspace-avatar-purple-fg: #2A1255;
--workspace-avatar-teal-bg:   #C8F5E8;  --workspace-avatar-teal-fg:   #0A3025;
--workspace-avatar-orange-bg: #FFE8CC;  --workspace-avatar-orange-fg: #4A2A00;
--workspace-avatar-pink-bg:   #FFD5EE;  --workspace-avatar-pink-fg:   #4A0825;
--workspace-avatar-slate-bg:  #DDE3EF;  --workspace-avatar-slate-fg:  #1C2030;
```

`.dark {}` 블록 끝에 다크 팔레트 추가 (현재 hex 값 유지):

```css
/* Workspace avatar — 다크 팔레트 */
--workspace-avatar-blue-bg:   #162236;  --workspace-avatar-blue-fg:   #6aadff;
--workspace-avatar-purple-bg: #231a45;  --workspace-avatar-purple-fg: #b59fff;
--workspace-avatar-teal-bg:   #0e2e25;  --workspace-avatar-teal-fg:   #4fd1a8;
--workspace-avatar-orange-bg: #2a1a10;  --workspace-avatar-orange-fg: #f5a05a;
--workspace-avatar-pink-bg:   #2e1029;  --workspace-avatar-pink-fg:   #f07bb8;
--workspace-avatar-slate-bg:  #1c2030;  --workspace-avatar-slate-fg:  #8aabcf;
```

### 2. `lib/utils/workspace-avatar.ts`

`WORKSPACE_AVATAR_COLORS` 배열을 CSS 변수 참조로 교체:

```ts
export const WORKSPACE_AVATAR_COLORS: WorkspaceAvatarColor[] = [
  { bg: 'var(--workspace-avatar-blue-bg)',   fg: 'var(--workspace-avatar-blue-fg)'   },
  { bg: 'var(--workspace-avatar-purple-bg)', fg: 'var(--workspace-avatar-purple-fg)' },
  { bg: 'var(--workspace-avatar-teal-bg)',   fg: 'var(--workspace-avatar-teal-fg)'   },
  { bg: 'var(--workspace-avatar-orange-bg)', fg: 'var(--workspace-avatar-orange-fg)' },
  { bg: 'var(--workspace-avatar-pink-bg)',   fg: 'var(--workspace-avatar-pink-fg)'   },
  { bg: 'var(--workspace-avatar-slate-bg)',  fg: 'var(--workspace-avatar-slate-fg)'  },
];
```

---

## No Changes Required

- `components/primitives/WorkspaceAvatar.tsx` — 이미 `style={{ background: color.bg, color: color.fg }}` 사용 중
- `app/__tests__/workspace-avatar.test.ts` — `toHaveProperty('bg')` / `toContain(color)` 방식으로 검증하므로 hex 비교 없음

---

## Color Palette

| 색상 | 라이트 bg | 라이트 fg | 다크 bg | 다크 fg |
|---|---|---|---|---|
| blue   | `#D8EAFF` | `#003258` | `#162236` | `#6aadff` |
| purple | `#E8E0FF` | `#2A1255` | `#231a45` | `#b59fff` |
| teal   | `#C8F5E8` | `#0A3025` | `#0e2e25` | `#4fd1a8` |
| orange | `#FFE8CC` | `#4A2A00` | `#2a1a10` | `#f5a05a` |
| pink   | `#FFD5EE` | `#4A0825` | `#2e1029` | `#f07bb8` |
| slate  | `#DDE3EF` | `#1C2030` | `#1c2030` | `#8aabcf` |

---

## Testing

`pnpm test` — 기존 19개 테스트 전부 통과 확인. 테스트 코드 변경 없음.
