# PG 정규 워크스페이스 합류 계정 admin 승인 게이트

**날짜:** 2026-06-18  
**상태:** 설계 확정

## 배경 & 문제

PG사 가입 시 기존 정규 워크스페이스(canonical PG workspace, e.g. 토스페이먼츠)에 합류하는 경우, 해당 워크스페이스는 이미 `active` 상태여서 워크스페이스 레벨 심사 게이트를 완전히 우회한다. 이메일 인증만 마치면 곧바로 앱에 진입하게 된다. Admin 알림도 없다.

**목표:** `joinCanonicalPgWorkspace` 플로우로 생성된 멤버십에 admin 승인 게이트를 추가한다.

## 스코프

- **이번 PR 범위 (이 레포):** DB 스키마 변경, shell guard, pending-approval 분기, 서비스 로직, admin 알림 이메일
- **admin 콘솔 (별도 레포):** 승인/거부 액션 구현 — 이번 PR 범위 밖, 핸드오프 필요

---

## 데이터 모델

### `workspace_members` 테이블

`approval_status` 컬럼 추가:

```ts
// lib/db/schema/workspace-members.ts
approvalStatus: text('approval_status').notNull().default('approved'),
// 값: 'approved' | 'pending_approval' | 'rejected'
```

- **DDL-additive.** 기존 멤버십 전부 `'approved'` 기본값 — 데이터 영향 없음
- `joinCanonicalPgWorkspace` 경로만 `'pending_approval'`로 생성
- Admin 승인 → `'approved'`, 거부 → `'rejected'`

### `WorkspaceMembershipSummary` 타입

```ts
// lib/types/workspace.ts
export type WorkspaceMembershipSummary = {
  id: string;
  name: string;
  type: WorkspaceType;
  status: 'pending' | 'active' | 'suspended';
  role: 'admin' | 'member';
  memberApprovalStatus: 'approved' | 'pending_approval' | 'rejected';  // 신규
  unreadCount: number;
  hasLogo: boolean;
};
```

`listForUser` 쿼리에 `workspaceMembers.approvalStatus as memberApprovalStatus` 를 select 목록에 추가.

---

## Shell Access Guard

`resolveShellAccess` (`lib/auth/shell-access.ts`) 게이트 순서:

```
unauthenticated               → /login
session revoked               → /logout
no workspace claim            → /logout
no DB membership              → /logout
emailVerified === false        → /pending-approval
memberApprovalStatus === 'pending_approval'  → /pending-approval  ← 신규
memberApprovalStatus === 'rejected'          → /suspended         ← 신규 (기존 페이지 재사용)
workspace.status === 'pending'               → /pending-approval
workspace.status === 'suspended'             → /suspended
→ render
```

`WorkspaceMembershipSummary`에 `memberApprovalStatus`가 포함되므로 `active.memberApprovalStatus`로 바로 읽는다. **`(app)/layout.tsx` 변경 없음.**

---

## `/pending-approval` 페이지 분기

파일: `app/(public)/pending-approval/page.tsx`

```
!emailVerified                              → <EmailVerifyScreen>          (기존)
memberApprovalStatus === 'pending_approval' → <MembershipApprovalWaitingScreen>  ← 신규
else                                        → <ApprovalWaitingScreen>       (기존, 워크스페이스 심사)
```

**`memberApprovalStatus` 조회 방법:** shell guard가 이 페이지로 보낸 시점에 JWT에 `session.user.workspaceId`가 있으므로 `workspaceMembers` 테이블에서 `(workspaceId, userId)` PK로 단건 조회.

### `MembershipApprovalWaitingScreen` (신규 컴포넌트)

- 파일: `components/pending-approval/membership-approval-waiting-screen.tsx`
- 구조: `ApprovalWaitingScreen`과 동일 (컨페티 + 셰이크 아이콘 + 폴링)
- 문구: "담당자 계정 합류 심사 중이에요" 류 (워크스페이스 입점 심사와 구별)
- 10초 폴링: `checkMyMembershipApprovalAction` 호출 → `approved` 시 `window.location.assign('/home')`

---

## Service & Action 변경

### `AuthService.joinCanonicalPgWorkspace`

```ts
// lib/server/services/auth.ts
await this.workspaceRepo.addMember(
  { workspaceId: input.selectedPgWorkspaceId, userId, role: 'member', approvalStatus: 'pending_approval' },
  tx,
);
// 커밋 후
notifyAdminNewMembershipAfterCommit({ userName: input.name, workspaceName: workspace.name, reviewUrl });
```

### `workspaceRepo.addMember` 시그니처

`approvalStatus?: string` 파라미터 추가 (기본값 `'approved'`). 기존 호출부 무수정.

### `joinCanonicalPgWorkspaceAction` redirectTo

`redirectTo: '/inbox'` → 로그인 후 shell guard가 자동으로 `/pending-approval`로 보내므로 `redirectTo: '/home'`으로 변경 (shell guard 자동 분기에 위임).

### 신규 액션: `checkMyMembershipApprovalAction`

- 파일: `lib/server/actions/auth/checkMyMembershipApprovalAction.ts`
- 세션의 `(workspaceId, userId)`로 `workspace_members.approval_status` 조회
- 반환: `{ status: 'approved' | 'pending_approval' | 'rejected' }`

---

## Admin 알림 이메일

기존 `notifyAdminNewSignupAfterCommit` 패턴 재사용.

```ts
// lib/server/notifications/admin-signup.ts 에 추가
export type AdminMembershipNotice = {
  userName: string;
  workspaceName: string;
  reviewUrl: string;
};

export function notifyAdminNewMembershipAfterCommit(notice: AdminMembershipNotice): void
```

이메일 제목: `[Supporter B] PG사 계정 합류 심사 요청 — {userName} ({workspaceName})`

---

## Admin 콘솔 핸드오프 (별도 레포)

`github.com/bothsides-platform-dev/admin-supporter-b` 에서 구현 필요:

- `workspace_members.approval_status = 'pending_approval'` 멤버 목록 조회 UI
- 승인 액션: `approval_status = 'approved'` 업데이트 + 유저에게 승인 이메일
- 거부 액션: `approval_status = 'rejected'` 업데이트 + 유저에게 거부 이메일

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `lib/db/schema/workspace-members.ts` | 컬럼 추가 |
| `lib/types/workspace.ts` | 타입 필드 추가 |
| `lib/server/repositories/drizzle/workspace.ts` | `listForUser` 쿼리 + `addMember` |
| `lib/server/repositories/types.ts` | interface 업데이트 |
| `lib/auth/shell-access.ts` | 게이트 2개 추가 |
| `lib/auth/__tests__/shell-access.test.ts` | 신규 케이스 |
| `app/(public)/pending-approval/page.tsx` | 3-way 분기 |
| `components/pending-approval/membership-approval-waiting-screen.tsx` | 신규 |
| `lib/server/actions/auth/checkMyMembershipApprovalAction.ts` | 신규 |
| `lib/server/services/auth.ts` | `joinCanonicalPgWorkspace` 수정 |
| `lib/server/notifications/admin-signup.ts` | 함수 추가 |

---

## TDD 접근

각 레이어를 독립적으로 단위 테스트:

1. `resolveShellAccess` — `pending_approval` / `rejected` 케이스
2. `checkMyMembershipApprovalAction` — 상태별 반환값
3. `joinCanonicalPgWorkspace` — `approvalStatus = 'pending_approval'` 설정 + admin 알림 호출
4. `pending-approval/page.tsx` — 3-way 분기 렌더링
