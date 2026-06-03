'use server';

import { eq, inArray } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { workspaceMembers, workspaces, users } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { WorkspaceStub } from './getDeleteAccountStatus';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_PASSWORD' }
  | { ok: false; error: 'LAST_ADMIN'; blockingWorkspaces: WorkspaceStub[] };

export async function deleteAccountAction(input: {
  password: string;
}): Promise<DeleteAccountResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const userId = session.user.id;
  const db = actionDb();

  // 1. 비밀번호 검증
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!valid) return { ok: false, error: 'INVALID_PASSWORD' };

  // 2. 모든 멤버십 조회 (워크스페이스 이름 포함)
  const myMemberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      name: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));

  const blockingWorkspaces: WorkspaceStub[] = [];
  const soloWorkspaceIds: string[] = [];

  for (const membership of myMemberships) {
    const allMembers = await db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, membership.workspaceId));

    if (allMembers.length === 1) {
      soloWorkspaceIds.push(membership.workspaceId);
    } else if (membership.role === 'admin') {
      const otherAdmins = allMembers.filter(
        (m: { userId: string; role: string }) => m.userId !== userId && m.role === 'admin',
      );
      if (otherAdmins.length === 0) {
        blockingWorkspaces.push({ id: membership.workspaceId, name: membership.name });
      }
    }
  }

  // 3. 차단 조건이 있으면 즉시 반환
  if (blockingWorkspaces.length > 0) {
    return { ok: false, error: 'LAST_ADMIN', blockingWorkspaces };
  }

  // 4. 트랜잭션: 단독 WS 삭제 → 나머지 멤버십 제거 → 소프트 딜리트
  await db.transaction(async (tx) => {
    if (soloWorkspaceIds.length > 0) {
      await tx
        .delete(workspaces)
        .where(inArray(workspaces.id, soloWorkspaceIds));
    }

    await tx
      .delete(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));

    await tx
      .update(users)
      .set({ deletedAt: new Date(), lastActiveWorkspaceId: null })
      .where(eq(users.id, userId));
  });

  return { ok: true };
}
