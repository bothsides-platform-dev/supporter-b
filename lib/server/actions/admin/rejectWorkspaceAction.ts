'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  verificationApplications,
  adminAuditLogs,
  workspaceMembers,
  users,
  workspaces,
} from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb, baseUrl } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { renderWorkspaceRejected } from '@/lib/server/outbox/templates/workspaceRejected';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';

type DB = ReturnType<typeof actionDb> | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

const ORG_LABEL: Record<'buyer' | 'pg', string> = {
  buyer: '구매사',
  pg: 'PG사',
};

export async function rejectWorkspaceAction(
  db: DB = actionDb(),
  workspaceId: string,
  reason: string,
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };

  const session = await requireAdminSession();
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outbox = new DrizzleOutboxRepository(db as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx.update(verificationApplications)
      .set({ status: 'rejected', reviewedBy: session.adminId, reviewedAt: now, reason })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.reject',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { reason },
    });

    // 거절 안내 이메일 — 신청자(admin 역할 멤버)에게 발송.
    // 멤버가 없는 경우(레거시 데이터 등)는 조용히 스킵한다.
    const [ownerRow] = await tx
      .select({
        email: users.email,
        wsName: workspaces.name,
        wsType: workspaces.type,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .limit(1);

    if (ownerRow) {
      const wsType = ownerRow.wsType as 'buyer' | 'pg';
      const html = await renderWorkspaceRejected({
        workspaceName: ownerRow.wsName,
        orgLabel: ORG_LABEL[wsType],
        reason,
        reapplyUrl: `${baseUrl()}/signup/${wsType === 'pg' ? 'pg' : 'buyer'}`,
      });
      await outbox.enqueue(
        {
          event: 'workspace.rejected',
          to: ownerRow.email,
          subject: '[Supporter B] 가입 심사 결과 — 보완이 필요합니다',
          html,
          dedupeKey: `workspace-rejected:${workspaceId}`,
        },
        tx,
      );
    }
  });

  flushAfterCommit();
  revalidatePath('/admin/review');
  revalidatePath('/admin');
  return { ok: true };
}
