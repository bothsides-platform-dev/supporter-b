# Account Deletion (계정 탈퇴) — Design Spec

**Date:** 2026-06-04  
**Status:** Approved

---

## Context

B2B 플랫폼으로서 사용자가 서비스를 탈퇴할 수 있어야 한다. 탈퇴 시:
- **워크스페이스 안전**: 탈퇴 후 어떤 워크스페이스에도 admin이 한 명 이상 남아야 한다.
- **콘텐츠 보존**: 탈퇴 유저가 작성한 RFP, 비드, 메시지 등은 워크스페이스에 보존된다.
- **실수 방지**: 비밀번호 확인 후 탈퇴 진행.

---

## Design Decisions

| 결정 | 선택 | 이유 |
|------|------|------|
| 삭제 방식 | 소프트 딜리트 (`deletedAt`) | 콘텐츠 FK가 RESTRICT이므로 하드 삭제 시 DB 오류. 스키마 변경 최소화. |
| 마지막 admin 처리 | 탈퇴 차단 + 안내 | 의도치 않은 권한 이전 방지 |
| 단독 워크스페이스 | 자동 삭제 | 아무도 없는 워크스페이스 방치 방지 |
| 비밀번호 확인 | 필요 | 실수 탈퇴 방지 |
| UI 위치 | settings/profile 하단 | 별도 페이지 불필요 |

---

## Schema Changes

### `lib/db/schema/users.ts`

```typescript
// 추가
deletedAt: timestamp('deleted_at', { withTimezone: true })
```

- nullable — null이면 활성 계정, NOT NULL이면 탈퇴 계정
- `drizzle-kit push` 로 적용

---

## Architecture

```
settings/profile page
└─ DeleteAccountSection (client, 최하단)
   ├─ Danger zone 섹션: 설명 텍스트 + [탈퇴하기] 버튼
   └─ Dialog (open 시 getDeleteAccountStatus() 즉시 호출)
       ├─ Loading: 조건 체크 중
       ├─ Blocked: 위임 필요한 워크스페이스 목록 + [멤버 설정으로 이동] 링크
       └─ Ready: 단독 WS 삭제 안내 + 비밀번호 입력 + [탈퇴 확인]
```

---

## Server Actions

### `getDeleteAccountStatus()` (read-only pre-check)

- **호출 시점**: Dialog가 열릴 때
- **반환**: `{ blockingWorkspaces: { id, name }[], soloWorkspaces: { id, name }[] }`
- **로직**: 모든 멤버십 순회 → blocking/solo 분류

### `deleteAccountAction({ password: string })`

**반환 타입**:
```typescript
| { ok: true }
| { ok: false; error: 'INVALID_PASSWORD' }
| { ok: false; error: 'LAST_ADMIN'; blockingWorkspaces: { id: string; name: string }[] }
```

**실행 순서**:
1. `requireSession()` → userId 획득
2. DB에서 user + passwordHash 조회, bcrypt compare → INVALID_PASSWORD
3. 모든 `workspace_members where userId = userId` 조회
4. 각 워크스페이스의 전체 멤버 수 조회:
   - 멤버 = 1 (본인만) → `soloWorkspaces`
   - 멤버 > 1 AND 본인이 admin AND 다른 admin 없음 → `blockingWorkspaces`
5. `blockingWorkspaces.length > 0` → LAST_ADMIN 반환
6. 트랜잭션:
   - `soloWorkspaces` 삭제 (ON DELETE CASCADE → workspace_members, notifications 등 정리)
   - `workspace_members WHERE userId = userId` 삭제 (나머지 멤버십)
   - `users SET deletedAt = now(), lastActiveWorkspaceId = null WHERE id = userId`
7. `{ ok: true }` 반환

---

## Auth Change

`auth.ts` `authorize()` 콜백:
```typescript
// 기존 user 조회 후
if (user.deletedAt) return null  // 탈퇴 계정 로그인 차단
```

---

## UI Behavior

### Blocked 상태
```
탈퇴하려면 먼저 아래 워크스페이스에서
다른 멤버에게 admin 권한을 위임하세요.

• [워크스페이스 A] → [멤버 설정으로 이동 ↗]
• [워크스페이스 B] → [멤버 설정으로 이동 ↗]
```
→ settings/members 페이지로 링크 (href 포함)

### Ready 상태 (solo WS 있는 경우 경고 포함)
```
정말 탈퇴하시겠어요?

⚠ 아래 워크스페이스는 멤버가 없어 함께 삭제됩니다:
  • [워크스페이스 A]

비밀번호를 입력하여 확인하세요:
[비밀번호 ••••••••]

[취소]  [탈퇴 확인]
```

### 성공 후
- `signOut({ callbackUrl: '/login' })` 호출 (next-auth/react)

---

## Linear Design Compliance

- Danger zone: `border border-error/30 rounded-[6px]` (shape-small)
- 버튼: `variant="destructive"` — 기존 Button 컴포넌트 사용
- Dialog: 기존 `@base-ui/react` Dialog 패턴 따름
- 에러 메시지: 워크스페이스명 `.md-numeric` 아님 (이름은 일반 텍스트)

---

## Files to Create / Modify

| 파일 | 작업 |
|------|------|
| `lib/db/schema/users.ts` | `deletedAt` 컬럼 추가 |
| `auth.ts` | `deletedAt IS NOT NULL` → login 차단 |
| `lib/server/actions/auth/getDeleteAccountStatus.ts` | 사전 체크 액션 (신규) |
| `lib/server/actions/auth/__tests__/getDeleteAccountStatus.test.ts` | TDD 테스트 (신규) |
| `lib/server/actions/auth/deleteAccountAction.ts` | 탈퇴 실행 액션 (신규) |
| `lib/server/actions/auth/__tests__/deleteAccountAction.test.ts` | TDD 테스트 (신규) |
| `components/settings/DeleteAccountSection.tsx` | UI 컴포넌트 (신규) |
| `components/settings/__tests__/DeleteAccountSection.test.tsx` | UI 테스트 (신규) |
| `app/(app)/settings/profile/page.tsx` | `<DeleteAccountSection />` 추가 |

---

## Verification Plan

1. `pnpm test lib/server/actions/auth/__tests__/deleteAccountAction.test.ts` — 모든 케이스 green
2. `pnpm test components/settings/__tests__/DeleteAccountSection.test.tsx` — UI 케이스 green
3. `pnpm test` — 전체 suite green
4. `pnpm tsc --noEmit` — 타입 에러 없음
5. 수동: dev 서버에서 탈퇴 플로우 실행
   - 마지막 admin인 워크스페이스 있을 때 → 차단 확인
   - 단독 워크스페이스 있을 때 → 경고 후 탈퇴 + WS 삭제 확인
   - 탈퇴 후 로그인 시도 → 차단 확인
