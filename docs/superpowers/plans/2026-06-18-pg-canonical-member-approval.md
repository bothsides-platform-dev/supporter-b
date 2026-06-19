# PG 정규 워크스페이스 합류 계정 Admin 승인 게이트 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `joinCanonicalPgWorkspace` 플로우(기존 PG 정규 워크스페이스 합류)로 생성된 멤버십에 admin 승인 게이트를 추가해, admin이 개별 PG 담당자 계정을 승인/거부할 수 있게 한다.

**Architecture:** `workspace_members.approval_status` 컬럼(default `'approved'`)을 추가하고 `joinCanonicalPgWorkspace` 시 `'pending_approval'`로 설정한다. Shell access guard에 멤버십 승인 게이트를 삽입하고, `/pending-approval` 페이지에 전용 대기 화면을 추가한다. Admin 콘솔(별도 레포)은 이 컬럼을 읽어 승인/거부 액션을 구현한다.

**Tech Stack:** Drizzle ORM + Postgres (drizzle-kit push), Next.js App Router Server Actions, React, Vitest + PGlite

## Global Constraints

- 모든 UI 문구: UX_WRITING.md §8 기준 (해요체·능동형·긍정형)
- Linear 디자인 규칙 준수 (DESIGN.md): 6px 보더 라디우스, 14px body, shadow 없음
- TDD: 모든 변경은 RED → GREEN → REFACTOR 순서
- `pnpm test <path>` 로 단일 파일 RED/GREEN 확인, 커밋 전 `pnpm test` 전체 green 확인
- 커밋: `git add <specific files>` — `git add -A` 금지
- 기존 타입/메서드명 유지, 인터페이스 변경 시 모든 호출부 동기화

---

## 파일 구조

| 파일 | 변경 유형 |
|---|---|
| `lib/db/schema/workspace-members.ts` | 수정 — `approvalStatus` 컬럼 추가 |
| `lib/types/workspace.ts` | 수정 — `MemberApprovalStatus` 타입 + `WorkspaceMembershipSummary` 필드 추가 |
| `lib/server/repositories/types.ts` | 수정 — `addMember` 시그니처, `getMemberApprovalStatus` 인터페이스 추가 |
| `lib/server/repositories/drizzle/workspace.ts` | 수정 — `listForUser`, `listAllWorkspacesForMaster`, `addMember`, `getMemberApprovalStatus` |
| `lib/auth/shell-access.ts` | 수정 — 멤버십 승인 게이트 2개 추가 |
| `lib/auth/__tests__/shell-access.test.ts` | 수정 — `ws()` 헬퍼 + 신규 테스트 3개 |
| `lib/server/outbox/templates/adminMembershipReview.tsx` | 신규 — admin 알림 이메일 템플릿 |
| `lib/server/notifications/admin-signup.ts` | 수정 — `notifyAdminNewMembershipAfterCommit` 추가 |
| `lib/server/services/auth.ts` | 수정 — `joinCanonicalPgWorkspace` 수정 |
| `lib/server/actions/auth/joinCanonicalPgWorkspaceAction.ts` | 수정 — `redirectTo` 변경 |
| `lib/server/actions/auth/__tests__/joinCanonicalPgWorkspace.test.ts` | 수정 — 기존 테스트 업데이트 + 신규 테스트 |
| `lib/server/actions/auth/checkMyMembershipApprovalAction.ts` | 신규 — 폴링 서버 액션 |
| `components/pending-approval/membership-approval-waiting-screen.tsx` | 신규 — 대기 화면 컴포넌트 |
| `components/pending-approval/membership-approval-waiting-screen.test.tsx` | 신규 — 컴포넌트 테스트 |
| `app/(public)/pending-approval/page.tsx` | 수정 — 3-way 분기 |

---

## Task 1: 스키마 + 타입 + 리포지토리 기반

**Files:**
- Modify: `lib/db/schema/workspace-members.ts`
- Modify: `lib/types/workspace.ts`
- Modify: `lib/server/repositories/types.ts`
- Modify: `lib/server/repositories/drizzle/workspace.ts`
- Modify: `lib/auth/__tests__/shell-access.test.ts` (ws() 헬퍼)

**Interfaces:**
- Produces:
  - `MemberApprovalStatus = 'approved' | 'pending_approval' | 'rejected'`
  - `WorkspaceMembershipSummary.memberApprovalStatus: MemberApprovalStatus`
  - `WorkspaceRepository.addMember(params: { ...; approvalStatus?: string }, tx?)`
  - `WorkspaceRepository.getMemberApprovalStatus(userId, workspaceId, tx?): Promise<MemberApprovalStatus | undefined>`

- [ ] **Step 1: `workspace-members.ts` — `approvalStatus` 컬럼 추가**

```ts
// lib/db/schema/workspace-members.ts
import { pgTable, uuid, timestamp, primaryKey, text, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { memberRoleEnum } from './_enums';
import { workspaces } from './workspaces';
import { users } from './users';

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('member'),
    approvalStatus: text('approval_status').notNull().default('approved'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().default(sql`now()`),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_idx').on(t.userId),
  ],
);
```

- [ ] **Step 2: `lib/types/workspace.ts` — `MemberApprovalStatus` + `WorkspaceMembershipSummary` 업데이트**

```ts
// lib/types/workspace.ts
import type { BizProfile } from './biz-profile';
import type { User } from './user';

export type WorkspaceType = 'buyer' | 'pg';

export type Workspace = {
  id: string;
  type: WorkspaceType;
  name: string;
  bizProfile?: BizProfile;
  members: User[];
  hasLogo: boolean;
  createdAt: string;
};

export type MemberApprovalStatus = 'approved' | 'pending_approval' | 'rejected';

export type WorkspaceMembershipSummary = {
  id: string;
  name: string;
  type: WorkspaceType;
  status: 'pending' | 'active' | 'suspended';
  role: 'admin' | 'member';
  memberApprovalStatus: MemberApprovalStatus;
  unreadCount: number;
  hasLogo: boolean;
};
```

- [ ] **Step 3: `lib/server/repositories/types.ts` — `addMember` + `getMemberApprovalStatus` 인터페이스 업데이트**

`addMember` 라인을 찾아 아래로 교체한다:
```ts
/** 멤버 추가 (onConflictDoNothing — 중복 race 안전). */
addMember(
  params: { workspaceId: string; userId: string; role: string; approvalStatus?: string },
  tx?: Tx,
): Promise<void>;
/** 멤버십 승인 상태 단건 조회. 행 없으면 undefined. */
getMemberApprovalStatus(
  userId: string,
  workspaceId: string,
  tx?: Tx,
): Promise<'approved' | 'pending_approval' | 'rejected' | undefined>;
```

또한 `MemberApprovalStatus` import 추가:
```ts
import type { WorkspaceMembershipSummary, MemberApprovalStatus } from '@/lib/types/workspace';
```

- [ ] **Step 4: `lib/server/repositories/drizzle/workspace.ts` — `listForUser` + `listAllWorkspacesForMaster` + `addMember` + `getMemberApprovalStatus` 업데이트**

`listForUser` select 블록에 `memberApprovalStatus` 추가:
```ts
async listForUser(
  userId: string,
  tx?: Tx,
): Promise<WorkspaceMembershipSummary[]> {
  const db = this.h(tx);
  return (await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      type: workspaces.type,
      status: workspaces.status,
      role: workspaceMembers.role,
      memberApprovalStatus: workspaceMembers.approvalStatus,
      unreadCount: sql<number>`(
        SELECT COALESCE(COUNT(*)::int, 0)
        FROM notifications
        WHERE workspace_id = ${workspaces.id}
          AND user_id = ${userId}
          AND channel = 'in_app'
          AND read_at IS NULL
      )`,
      hasLogo: workspaces.hasLogo,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.joinedAt))) as WorkspaceMembershipSummary[];
}
```

`listAllWorkspacesForMaster` select 블록에 `memberApprovalStatus` 추가:
```ts
async listAllWorkspacesForMaster(tx?: Tx): Promise<WorkspaceMembershipSummary[]> {
  const db = this.h(tx);
  return (await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      type: workspaces.type,
      status: workspaces.status,
      role: sql<'admin'>`'admin'`,
      memberApprovalStatus: sql<'approved'>`'approved'`,
      unreadCount: sql<number>`0`,
      hasLogo: workspaces.hasLogo,
    })
    .from(workspaces)
    .where(eq(workspaces.status, 'active'))
    .orderBy(asc(workspaces.name))
    .limit(500)) as WorkspaceMembershipSummary[];
}
```

`addMember` — `approvalStatus` 파라미터 반영:
```ts
async addMember(
  params: { workspaceId: string; userId: string; role: string; approvalStatus?: string },
  tx?: Tx,
): Promise<void> {
  const db = this.h(tx);
  await db
    .insert(workspaceMembers)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      role: params.role as MemberRow['role'],
      approvalStatus: params.approvalStatus ?? 'approved',
    })
    .onConflictDoNothing({
      target: [workspaceMembers.workspaceId, workspaceMembers.userId],
    });
}
```

`getMemberApprovalStatus` 메서드 추가 (기존 `getMembership` 바로 뒤):
```ts
async getMemberApprovalStatus(
  userId: string,
  workspaceId: string,
  tx?: Tx,
): Promise<'approved' | 'pending_approval' | 'rejected' | undefined> {
  const db = this.h(tx);
  const [row] = await db
    .select({ approvalStatus: workspaceMembers.approvalStatus })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row?.approvalStatus as 'approved' | 'pending_approval' | 'rejected' | undefined;
}
```

- [ ] **Step 5: `lib/auth/__tests__/shell-access.test.ts` — `ws()` 헬퍼에 `memberApprovalStatus` 기본값 추가**

`ws()` 함수의 기본 객체에 `memberApprovalStatus: 'approved'` 추가:
```ts
function ws(
  over: Partial<WorkspaceMembershipSummary> = {},
): WorkspaceMembershipSummary {
  return {
    id: 'ws-1',
    name: 'Acme',
    type: 'buyer',
    status: 'active',
    role: 'admin',
    memberApprovalStatus: 'approved',
    unreadCount: 0,
    hasLogo: false,
    ...over,
  };
}
```

- [ ] **Step 6: 기존 shell-access 테스트가 여전히 통과하는지 확인**

```bash
pnpm test lib/auth/__tests__/shell-access.test.ts
```

Expected: 기존 테스트 전부 PASS (타입 변경이 기존 케이스에 영향 없음)

- [ ] **Step 7: 커밋**

```bash
git add lib/db/schema/workspace-members.ts lib/types/workspace.ts lib/server/repositories/types.ts lib/server/repositories/drizzle/workspace.ts lib/auth/__tests__/shell-access.test.ts
git commit -m "$(cat <<'EOF'
feat: workspace_members.approval_status 컬럼 + 타입/리포지토리 기반 추가

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Shell Access Guard — 멤버십 승인 게이트

**Files:**
- Modify: `lib/auth/shell-access.ts`
- Modify: `lib/auth/__tests__/shell-access.test.ts`

**Interfaces:**
- Consumes: `WorkspaceMembershipSummary.memberApprovalStatus` (Task 1)

- [ ] **Step 1: 테스트 먼저 — 실패하는 테스트 3개 작성**

`lib/auth/__tests__/shell-access.test.ts` 끝에 describe 블록 추가:
```ts
describe('membership approval gate', () => {
  it('멤버십 pending_approval + 이메일 인증 완료 → /pending-approval', () => {
    expect(
      resolveShellAccess(
        { user: completeUser },
        [ws({ status: 'active', memberApprovalStatus: 'pending_approval' })],
        undefined,
        true,
      ),
    ).toEqual({ kind: 'redirect', to: '/pending-approval' });
  });

  it('멤버십 rejected + 이메일 인증 완료 → /suspended', () => {
    expect(
      resolveShellAccess(
        { user: completeUser },
        [ws({ status: 'active', memberApprovalStatus: 'rejected' })],
        undefined,
        true,
      ),
    ).toEqual({ kind: 'redirect', to: '/suspended' });
  });

  it('이메일 미인증 + pending_approval → /pending-approval (email 게이트가 approval 게이트보다 우선)', () => {
    expect(
      resolveShellAccess(
        { user: completeUser },
        [ws({ status: 'active', memberApprovalStatus: 'pending_approval' })],
        undefined,
        false,
      ),
    ).toEqual({ kind: 'redirect', to: '/pending-approval' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test lib/auth/__tests__/shell-access.test.ts
```

Expected: 신규 3개 FAIL (게이트가 아직 없으므로 `render` 반환)

- [ ] **Step 3: `lib/auth/shell-access.ts` — 멤버십 게이트 2개 삽입**

이메일 인증 게이트 블록(`if (emailVerified === false)`) 바로 뒤에 추가:
```ts
// Membership-level approval gate — joinCanonicalPgWorkspace 로 합류한 PG 담당자
// 계정이 admin 승인을 받을 때까지 앱 진입을 차단한다.
// email 인증 게이트(위)가 먼저 평가되므로, 여기 도달하면 이메일은 인증된 상태.
if (active.memberApprovalStatus === 'pending_approval') {
  return { kind: 'redirect', to: '/pending-approval' };
}
if (active.memberApprovalStatus === 'rejected') {
  return { kind: 'redirect', to: '/suspended' };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test lib/auth/__tests__/shell-access.test.ts
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/auth/shell-access.ts lib/auth/__tests__/shell-access.test.ts
git commit -m "$(cat <<'EOF'
feat: shell-access guard에 멤버십 승인 게이트 추가 (pending_approval/rejected)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: joinCanonicalPgWorkspace 서비스 + Admin 알림

**Files:**
- Create: `lib/server/outbox/templates/adminMembershipReview.tsx`
- Modify: `lib/server/notifications/admin-signup.ts`
- Modify: `lib/server/services/auth.ts`
- Modify: `lib/server/actions/auth/joinCanonicalPgWorkspaceAction.ts`
- Modify: `lib/server/actions/auth/__tests__/joinCanonicalPgWorkspace.test.ts`

**Interfaces:**
- Consumes: `workspaceRepo.addMember(..., { approvalStatus: 'pending_approval' })` (Task 1)
- Produces: `notifyAdminNewMembershipAfterCommit({ userName, workspaceName, reviewUrl })`

- [ ] **Step 1: 테스트 먼저 — 신규 불변식 테스트 작성**

`lib/server/actions/auth/__tests__/joinCanonicalPgWorkspace.test.ts` 의 기존 성공 케이스 아래에 describe 블록 추가:

```ts
describe('joinCanonicalPgWorkspaceAction — 멤버십 승인 상태', () => {
  it('canonical PG 합류 시 멤버십 approval_status가 pending_approval로 생성된다', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(true);

    const [newUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, TEST_EMAIL))
      .limit(1);

    const [membership] = await db
      .select({ approvalStatus: workspaceMembers.approvalStatus })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, newUser.id));

    expect(membership.approvalStatus).toBe('pending_approval');
  });

  it('redirectTo가 /home이다', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId, selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.redirectTo).toBe('/home');
  });
});
```

기존 테스트 중 `redirectTo('/inbox')` 검증 케이스도 `/home`으로 변경:
```ts
// 변경 전:
if (r.ok) expect(r.redirectTo).toBe('/inbox');
// 변경 후:
if (r.ok) expect(r.redirectTo).toBe('/home');
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test lib/server/actions/auth/__tests__/joinCanonicalPgWorkspace.test.ts
```

Expected: approval_status 신규 테스트 FAIL (`approval_status = 'approved'` 반환됨), redirectTo 테스트 FAIL (`/inbox` 반환됨)

- [ ] **Step 3: `adminMembershipReview.tsx` 이메일 템플릿 생성**

```tsx
// lib/server/outbox/templates/adminMembershipReview.tsx
import * as React from 'react';
import { render } from '@react-email/render';
import { Button, Layout, Mono } from './_layout';

export interface AdminMembershipReviewProps {
  userName: string;
  workspaceName: string;
  reviewUrl: string;
}

export function AdminMembershipReview({
  userName,
  workspaceName,
  reviewUrl,
}: AdminMembershipReviewProps): React.JSX.Element {
  return (
    <Layout
      preheader={`PG사 계정 합류 심사 요청 — ${userName} (${workspaceName})`}
      serial="ADMIN / MEMBERSHIP REVIEW"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        PG사 계정 합류 심사 요청
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        <strong>
          <Mono>{workspaceName}</Mono>
        </strong>
        의 새 담당자{' '}
        <strong>
          <Mono>{userName}</Mono>
        </strong>
        이(가) 계정을 생성해 심사를 기다리고 있습니다.
      </p>
      <p style={{ margin: '0 0 24px', fontSize: '14px' }}>
        아래 버튼을 눌러 심사 상세를 확인하세요.
      </p>
      <Button href={reviewUrl}>심사하러 가기</Button>
      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{reviewUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderAdminMembershipReview(
  props: AdminMembershipReviewProps,
): Promise<string> {
  return render(<AdminMembershipReview {...props} />);
}
```

- [ ] **Step 4: `lib/server/notifications/admin-signup.ts` — `notifyAdminNewMembershipAfterCommit` 추가**

파일 끝에 추가 (기존 `notifyAdminNewSignupAfterCommit` 아래):

```ts
import { renderAdminMembershipReview } from '@/lib/server/outbox/templates/adminMembershipReview';

export type AdminMembershipNotice = {
  userName: string;
  workspaceName: string;
  reviewUrl: string;
};

export function buildAdminMembershipSubject(notice: AdminMembershipNotice): string {
  return `[Supporter B] PG사 계정 합류 심사 요청 — ${notice.userName} (${notice.workspaceName})`;
}

export function notifyAdminNewMembershipAfterCommit(notice: AdminMembershipNotice): void {
  try {
    after(async () => {
      try {
        const html = await renderAdminMembershipReview({
          userName: notice.userName,
          workspaceName: notice.workspaceName,
          reviewUrl: notice.reviewUrl,
        });
        await sendAdminEmail({ subject: buildAdminMembershipSubject(notice), html });
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: 'admin-membership-notify' },
        });
      }
    });
  } catch {
    // 요청 스코프 밖(예: vitest) — no-op.
  }
}
```

- [ ] **Step 5: `lib/server/services/auth.ts` — `joinCanonicalPgWorkspace` 수정**

`joinCanonicalPgWorkspace` 메서드에서 두 곳 수정:

(a) `addMember` 호출에 `approvalStatus` 추가:
```ts
await this.workspaceRepo.addMember(
  { workspaceId: input.selectedPgWorkspaceId, userId, role: 'member', approvalStatus: 'pending_approval' },
  tx,
);
```

(b) 트랜잭션 성공 후 admin 알림 추가 (return 직전, `result.ok`일 때). 서비스에서는 `after()` 없이 호출자(action)에게 알림을 위임하는 패턴이 맞으므로, 서비스는 `workspaceName`을 반환하고 action에서 알림을 발송한다.

먼저 서비스 반환 타입 변경:
```ts
// 변경 전
return { ok: true, email };
// 변경 후
return { ok: true, email, workspaceName: workspace.name };
```

그리고 `ServiceResult` 타입에 `workspaceName` 추가:
```ts
async joinCanonicalPgWorkspace(input: { ... }): Promise<ServiceResult<{ email: string; workspaceName: string }>>
```

- [ ] **Step 6: `joinCanonicalPgWorkspaceAction.ts` — `redirectTo` + admin 알림 추가**

```ts
// lib/server/actions/auth/joinCanonicalPgWorkspaceAction.ts
'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { passwordSchema } from '@/lib/auth/password-validation';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { normalizePhone } from './phoneOtpUtils';
import { getAuthService } from '@/lib/server/services/auth';
import { adminBaseUrl } from '@/lib/server/env';
import { notifyAdminNewMembershipAfterCommit } from '@/lib/server/notifications/admin-signup';

// ... Input, JoinCanonicalPgWorkspaceInput, JoinCanonicalPgWorkspaceResult 동일 ...

export async function joinCanonicalPgWorkspaceAction(
  input: JoinCanonicalPgWorkspaceInput,
): Promise<JoinCanonicalPgWorkspaceResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    const weak = parsed.error.issues.some(
      (i) => i.path[0] === 'password' && i.message === 'WEAK_PASSWORD',
    );
    return { ok: false, error: weak ? 'WEAK_PASSWORD' : 'INVALID_INPUT' };
  }

  const email = normalizeEmail(parsed.data.email);
  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) return { ok: false, error: 'INVALID_INPUT' };

  const svc = await getAuthService();
  const result = await svc.joinCanonicalPgWorkspace({
    email,
    name: parsed.data.name,
    plainPassword: parsed.data.password,
    phone: normalizedPhone,
    phoneVerificationId: parsed.data.phoneVerificationId,
    selectedPgWorkspaceId: parsed.data.selectedPgWorkspaceId,
  });

  if (!result.ok) return result;

  notifyAdminNewMembershipAfterCommit({
    userName: parsed.data.name,
    workspaceName: result.workspaceName,
    reviewUrl: `${adminBaseUrl()}/admin/pg-members`,
  });

  return {
    ok: true,
    redirectTo: '/home',
    email: result.email,
    password: parsed.data.password,
  };
}
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
pnpm test lib/server/actions/auth/__tests__/joinCanonicalPgWorkspace.test.ts
```

Expected: 전체 PASS (approval_status = 'pending_approval', redirectTo = '/home')

- [ ] **Step 8: 전체 테스트 확인**

```bash
pnpm test
```

Expected: 전체 PASS (기존 테스트 회귀 없음)

- [ ] **Step 9: 커밋**

```bash
git add lib/server/outbox/templates/adminMembershipReview.tsx lib/server/notifications/admin-signup.ts lib/server/services/auth.ts lib/server/actions/auth/joinCanonicalPgWorkspaceAction.ts lib/server/actions/auth/__tests__/joinCanonicalPgWorkspace.test.ts
git commit -m "$(cat <<'EOF'
feat: joinCanonicalPgWorkspace 멤버십 pending_approval + admin 알림 추가

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: checkMyMembershipApprovalAction

**Files:**
- Create: `lib/server/actions/auth/checkMyMembershipApprovalAction.ts`

**Interfaces:**
- Consumes: `WorkspaceRepository.getMemberApprovalStatus` (Task 1)
- Produces: `checkMyMembershipApprovalAction(): Promise<{ status: 'approved' | 'pending_approval' | 'rejected' | 'unknown' }>`

- [ ] **Step 1: 테스트 먼저 — 파일 생성 전 실패 테스트 작성**

`lib/server/actions/auth/__tests__/checkMyMembershipApproval.test.ts` 생성:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve({ get: () => null }) }));

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

const { getMemberApprovalStatusMock } = vi.hoisted(() => ({
  getMemberApprovalStatusMock: vi.fn(),
}));
vi.mock('@/lib/server/repositories/factory', () => ({
  getWorkspaceRepo: async () => ({
    getMemberApprovalStatus: getMemberApprovalStatusMock,
  }),
}));

import { checkMyMembershipApprovalAction } from '../checkMyMembershipApprovalAction';

const SESSION = {
  user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'pg' as const },
};

beforeEach(() => {
  authMock.mockResolvedValue(SESSION);
  getMemberApprovalStatusMock.mockResolvedValue('pending_approval');
});

describe('checkMyMembershipApprovalAction', () => {
  it('pending_approval 상태를 반환한다', async () => {
    const r = await checkMyMembershipApprovalAction();
    expect(r).toEqual({ status: 'pending_approval' });
    expect(getMemberApprovalStatusMock).toHaveBeenCalledWith('u-1', 'ws-1');
  });

  it('approved 상태를 반환한다', async () => {
    getMemberApprovalStatusMock.mockResolvedValue('approved');
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'approved' });
  });

  it('rejected 상태를 반환한다', async () => {
    getMemberApprovalStatusMock.mockResolvedValue('rejected');
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'rejected' });
  });

  it('DB에 행 없음(undefined) → approved로 폴백', async () => {
    getMemberApprovalStatusMock.mockResolvedValue(undefined);
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'approved' });
  });

  it('세션 없음 → unknown', async () => {
    authMock.mockResolvedValue(null);
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'unknown' });
  });

  it('workspaceId 없음 → unknown', async () => {
    authMock.mockResolvedValue({ user: { id: 'u-1' } });
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'unknown' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test lib/server/actions/auth/__tests__/checkMyMembershipApproval.test.ts
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```ts
// lib/server/actions/auth/checkMyMembershipApprovalAction.ts
'use server';

import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export async function checkMyMembershipApprovalAction(): Promise<{
  status: 'approved' | 'pending_approval' | 'rejected' | 'unknown';
}> {
  const session = await auth();
  const userId = session?.user?.id;
  const workspaceId = session?.user?.workspaceId;
  if (!userId || !workspaceId) return { status: 'unknown' };

  const repo = await getWorkspaceRepo();
  const approvalStatus = await repo.getMemberApprovalStatus(userId, workspaceId);
  return { status: approvalStatus ?? 'approved' };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test lib/server/actions/auth/__tests__/checkMyMembershipApproval.test.ts
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/server/actions/auth/checkMyMembershipApprovalAction.ts lib/server/actions/auth/__tests__/checkMyMembershipApproval.test.ts
git commit -m "$(cat <<'EOF'
feat: checkMyMembershipApprovalAction 추가

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: MembershipApprovalWaitingScreen 컴포넌트

**Files:**
- Create: `components/pending-approval/membership-approval-waiting-screen.tsx`
- Create: `components/pending-approval/membership-approval-waiting-screen.test.tsx`

**Interfaces:**
- Consumes: `checkMyMembershipApprovalAction` (Task 4)
- Produces: `<MembershipApprovalWaitingScreen />` — no props

- [ ] **Step 1: 테스트 먼저 작성**

```tsx
// components/pending-approval/membership-approval-waiting-screen.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MembershipApprovalWaitingScreen } from '@/components/pending-approval/membership-approval-waiting-screen';

const { approvalActionMock } = vi.hoisted(() => ({ approvalActionMock: vi.fn() }));
vi.mock('@/lib/server/actions/auth/checkMyMembershipApprovalAction', () => ({
  checkMyMembershipApprovalAction: approvalActionMock,
}));

const { animationStartMock } = vi.hoisted(() => ({
  animationStartMock: vi.fn(),
}));

vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, style, className }: Record<string, unknown>) =>
      <span style={style as React.CSSProperties} className={className as string}>{children as React.ReactNode}</span>,
  },
  useAnimation: vi.fn(() => ({ start: animationStartMock })),
}));

beforeEach(() => {
  animationStartMock.mockClear();
  approvalActionMock.mockResolvedValue({ status: 'pending_approval' });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

afterEach(cleanup);

describe('MembershipApprovalWaitingScreen', () => {
  it('심사 대기 제목을 렌더한다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(screen.getByText('담당자 계정 심사 중이에요')).toBeInTheDocument();
  });

  it('심사 소요 칩과 채널톡 문의 안내를 렌더한다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(screen.getByText(/심사는 영업일 기준 2일 이내/)).toBeInTheDocument();
    expect(screen.getByText(/채널톡/)).toBeInTheDocument();
  });

  it('로그아웃 버튼이 있다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('로그아웃 버튼 클릭 시 /logout으로 이동한다', async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true });
    render(<MembershipApprovalWaitingScreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    expect(assignMock).toHaveBeenCalledWith('/logout');
  });

  it('마운트 시 아이콘 셰이크 애니메이션을 시작한다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(animationStartMock).toHaveBeenCalledTimes(1);
  });

  describe('승인 폴링', () => {
    let assignMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      assignMock = vi.fn();
      Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true });
    });

    afterEach(() => vi.useRealTimers());

    it('10초 경과 전에는 window.location.assign을 호출하지 않는다', async () => {
      render(<MembershipApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(9999); });
      expect(assignMock).not.toHaveBeenCalled();
    });

    it('status=approved 반환 시 window.location.assign("/home")을 호출한다', async () => {
      approvalActionMock.mockResolvedValue({ status: 'approved' });
      render(<MembershipApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(assignMock).toHaveBeenCalledWith('/home');
    });

    it('status=pending_approval 동안은 window.location.assign을 호출하지 않는다', async () => {
      render(<MembershipApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(assignMock).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test components/pending-approval/membership-approval-waiting-screen.test.tsx
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: 컴포넌트 구현**

```tsx
// components/pending-approval/membership-approval-waiting-screen.tsx
'use client';

import { useCallback, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { motion, useAnimation } from 'motion/react';
import { Chip } from '@/components/primitives/Chip';
import { checkMyMembershipApprovalAction } from '@/lib/server/actions/auth/checkMyMembershipApprovalAction';

const ICON_SPAN_STYLE = { display: 'inline-flex' } as const;

function handleLogout() {
  window.location.assign('/logout');
}

export function MembershipApprovalWaitingScreen() {
  const iconControls = useAnimation();

  const shake = useCallback(() => {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      iconControls.start({
        rotate: [-14, 12, -9, 7, -4, 2, 0],
        scale: [1, 1.3, 1.22, 1.15, 1.1, 1.04, 1],
        transition: { duration: 0.65, ease: 'easeOut' },
      });
    }
  }, [iconControls]);

  useEffect(() => {
    shake();
  }, [shake]);

  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      const r = await checkMyMembershipApprovalAction();
      if (active && r.status === 'approved') {
        clearInterval(id);
        window.location.assign('/home');
      }
    }, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="relative z-10 flex w-full flex-col items-center gap-4 text-center">
      <button
        type="button"
        aria-label="아이콘 흔들기"
        onClick={shake}
        className="rounded-[var(--md-sys-shape-small)] p-2 text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
      >
        <motion.span animate={iconControls} style={ICON_SPAN_STYLE}>
          <Clock className="size-9" strokeWidth={1.5} />
        </motion.span>
      </button>
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-title-large">담당자 계정 심사 중이에요</h1>
        <p className="text-body-medium text-on-surface-variant">
          합류 신청을 완료했어요.
          <br />
          운영팀이 계정을 검토하고 있어요.
        </p>
      </div>
      <Chip color="tertiary" label="✓ 심사는 영업일 기준 2일 이내로 완료해요" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-body-small text-on-surface-variant">
          승인되면 이메일로 안내드립니다.
        </p>
        <p className="text-body-small text-on-surface-variant">
          궁금한 점은 우측 하단 채널톡으로 문의해요.
        </p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
      >
        로그아웃
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test components/pending-approval/membership-approval-waiting-screen.test.tsx
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add components/pending-approval/membership-approval-waiting-screen.tsx components/pending-approval/membership-approval-waiting-screen.test.tsx
git commit -m "$(cat <<'EOF'
feat: MembershipApprovalWaitingScreen 컴포넌트 추가

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: /pending-approval 페이지 3-way 분기

**Files:**
- Modify: `app/(public)/pending-approval/page.tsx`

**Interfaces:**
- Consumes: `WorkspaceRepository.getMemberApprovalStatus` (Task 1), `MembershipApprovalWaitingScreen` (Task 5)

- [ ] **Step 1: 테스트 먼저 — 분기별 렌더링 테스트 작성**

`app/(public)/pending-approval/__tests__/page.test.tsx` 생성:

```tsx
// app/(public)/pending-approval/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

const { findByIdMock } = vi.hoisted(() => ({ findByIdMock: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getUserRepo: async () => ({ findById: findByIdMock }),
  getWorkspaceRepo: async () => ({
    getMemberApprovalStatus: getMemberApprovalStatusMock,
  }),
}));

const { getMemberApprovalStatusMock } = vi.hoisted(() => ({
  getMemberApprovalStatusMock: vi.fn(),
}));

vi.mock('@/components/pending-approval/email-verify-screen', () => ({
  EmailVerifyScreen: ({ email }: { email: string }) => <div>EmailVerifyScreen:{email}</div>,
}));
vi.mock('@/components/pending-approval/membership-approval-waiting-screen', () => ({
  MembershipApprovalWaitingScreen: () => <div>MembershipApprovalWaitingScreen</div>,
}));
vi.mock('@/components/pending-approval/approval-waiting-screen', () => ({
  ApprovalWaitingScreen: () => <div>ApprovalWaitingScreen</div>,
}));

import PendingApprovalPage from '../page';

const SESSION = {
  user: { id: 'u-1', workspaceId: 'ws-1', email: 'a@example.com' },
};

beforeEach(() => {
  authMock.mockResolvedValue(SESSION);
  findByIdMock.mockResolvedValue({ id: 'u-1', emailVerified: true });
  getMemberApprovalStatusMock.mockResolvedValue('approved');
});
afterEach(cleanup);

describe('PendingApprovalPage 분기', () => {
  it('emailVerified=false → EmailVerifyScreen 렌더', async () => {
    findByIdMock.mockResolvedValue({ id: 'u-1', emailVerified: false });
    render(await PendingApprovalPage());
    expect(screen.getByText('EmailVerifyScreen:a@example.com')).toBeInTheDocument();
  });

  it('emailVerified=true + memberApprovalStatus=pending_approval → MembershipApprovalWaitingScreen 렌더', async () => {
    getMemberApprovalStatusMock.mockResolvedValue('pending_approval');
    render(await PendingApprovalPage());
    expect(screen.getByText('MembershipApprovalWaitingScreen')).toBeInTheDocument();
  });

  it('emailVerified=true + memberApprovalStatus=approved → ApprovalWaitingScreen 렌더', async () => {
    render(await PendingApprovalPage());
    expect(screen.getByText('ApprovalWaitingScreen')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test "app/\(public\)/pending-approval/__tests__/page.test.tsx"
```

Expected: FAIL (분기 없음 — approval waiting 항상 렌더됨)

- [ ] **Step 3: 페이지 3-way 분기 구현**

```tsx
// app/(public)/pending-approval/page.tsx
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';
import { EmailVerifyScreen } from '@/components/pending-approval/email-verify-screen';
import { MembershipApprovalWaitingScreen } from '@/components/pending-approval/membership-approval-waiting-screen';

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await (await getUserRepo()).findById(session.user.id);

  if (user && !user.emailVerified) {
    return <EmailVerifyScreen email={session.user.email ?? ''} />;
  }

  const workspaceId = session.user.workspaceId;
  if (workspaceId) {
    const memberApprovalStatus = await (await getWorkspaceRepo()).getMemberApprovalStatus(
      session.user.id,
      workspaceId,
    );
    if (memberApprovalStatus === 'pending_approval') {
      return <MembershipApprovalWaitingScreen />;
    }
  }

  return <ApprovalWaitingScreen />;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test "app/\(public\)/pending-approval/__tests__/page.test.tsx"
```

Expected: 전체 PASS

- [ ] **Step 5: 전체 테스트 확인**

```bash
pnpm test
```

Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/pending-approval/page.tsx" "app/(public)/pending-approval/__tests__/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat: /pending-approval 페이지에 멤버십 승인 대기 3-way 분기 추가

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## 완료 체크리스트

- [ ] `pnpm tsc --noEmit` — 타입 에러 0
- [ ] `pnpm lint` — 에러 0
- [ ] `pnpm test` — 전체 green
- [ ] DB push: `pnpm drizzle-kit push` — `approval_status` 컬럼 추가 (additive, 기존 데이터 안전)

## Admin 콘솔 핸드오프

`github.com/bothsides-platform-dev/admin-supporter-b` 에서 별도 구현 필요:
- `workspace_members.approval_status = 'pending_approval'` 인 멤버 목록 조회 UI (`/admin/pg-members`)
- 승인 액션: `approval_status = 'approved'` 업데이트 + 유저에게 승인 이메일 발송
- 거부 액션: `approval_status = 'rejected'` 업데이트 + 유저에게 거부 이메일 발송
