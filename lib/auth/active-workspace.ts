// Active-workspace resolution — shared by login (auth.ts `authorize`) and the
// runtime switch (switchWorkspaceAction). Node-only (the repo resolves the
// postgres-js client); MUST NOT be imported by auth.config.ts, which stays
// edge-safe.
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export type ActiveMembership = {
  workspaceId: string;
  role: 'admin' | 'member';
  workspaceType: 'buyer' | 'pg';
  approvalStatus: 'approved' | 'pending_approval' | 'rejected';
};

/**
 * 효과적인(authority 를 행사할 수 있는) admin 인가? — role='admin' AND
 * approvalStatus='approved'. canonical-PG 합류자는 승인 전까지 role='admin' 이지만
 * pending_approval 이며, shell 가드는 RSC 렌더만 막고 서버액션은 막지 않으므로
 * admin 권한 게이트는 반드시 이 헬퍼로 승인까지 확인해야 한다.
 */
export function isApprovedAdmin(membership: ActiveMembership | null): boolean {
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
