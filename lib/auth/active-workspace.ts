// Active-workspace resolution — shared by login (auth.ts `authorize`) and the
// runtime switch (switchWorkspaceAction). Node-only (the repo resolves the
// postgres-js client); MUST NOT be imported by auth.config.ts, which stays
// edge-safe.
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import type { MemberApprovalStatus } from '@/lib/types/workspace';

export type ActiveMembership = {
  workspaceId: string;
  role: 'admin' | 'member';
  workspaceType: 'buyer' | 'pg';
  approvalStatus: 'approved' | 'pending_approval' | 'rejected';
};

/** `isApprovedAdmin` 이 판정할 수 있는 최소 멤버십 형태 — role + 승인 상태만 본다. */
export type ApprovedAdminCandidate = {
  role: string;
  approvalStatus: MemberApprovalStatus;
};

/**
 * 효과적인(authority 를 행사할 수 있는) admin 인가? — role='admin' AND
 * approvalStatus='approved'. canonical-PG 합류자는 승인 전까지 role='admin' 이지만
 * pending_approval 이며, shell 가드는 RSC 렌더만 막고 서버액션은 막지 않으므로
 * admin 권한 게이트는 반드시 이 헬퍼로 승인까지 확인해야 한다.
 *
 * "실효 admin" 판정의 단일 출처 — 호출자(권한 게이트)뿐 아니라 **대상**(마지막 admin
 * 판정, 잔여 admin 집계)에도 같은 기준을 써야 한다. `workspaceRepo.countAdmins` 의
 * `approvalStatus='approved'` 필터가 이 헬퍼의 SQL 쌍이므로 둘은 함께 움직여야 한다.
 */
export function isApprovedAdmin(membership: ApprovedAdminCandidate | null): boolean {
  return membership?.role === 'admin' && membership.approvalStatus === 'approved';
}

// drizzle instance — postgres-js in prod, pglite in tests. DB access now goes
// through the repository factory; the param is retained for call-site
// compatibility (services/actions/pages) but is no longer touched directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Membership of a specific workspace, with role + workspace type, or null. */
export async function getMembership(
  userId: string,
  workspaceId: string,
): Promise<ActiveMembership | null> {
  const workspaceRepo = await getWorkspaceRepo();
  const row = await workspaceRepo.getMembership(userId, workspaceId);
  if (!row) return null;
  // Repo names the key `type`; the app shape uses `workspaceType`.
  return {
    workspaceId,
    role: row.role as ActiveMembership['role'],
    workspaceType: row.type,
    approvalStatus: row.approvalStatus,
  };
}

/**
 * Pick the workspace a user lands in: their remembered `lastActiveWorkspaceId`
 * if they're still a member, else the earliest-joined membership. null when the
 * user belongs to no workspace.
 */
export async function resolveInitialMembership(
  _db: Db,
  userId: string,
  lastActiveWorkspaceId: string | null,
): Promise<ActiveMembership | null> {
  if (lastActiveWorkspaceId) {
    const preferred = await getMembership(userId, lastActiveWorkspaceId);
    if (preferred) return preferred;
  }
  const workspaceRepo = await getWorkspaceRepo();
  const row = await workspaceRepo.findInitialMembership(userId);
  if (!row) return null;
  // Repo names the key `type`; the app shape uses `workspaceType`.
  return {
    workspaceId: row.workspaceId,
    role: row.role as ActiveMembership['role'],
    workspaceType: row.type,
    approvalStatus: row.approvalStatus,
  };
}
