'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  workspaces,
  verificationApplications,
  adminAuditLogs,
  workspaceMembers,
  users,
} from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb, baseUrl } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { renderWorkspaceApproved } from '@/lib/server/outbox/templates/workspaceApproved';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';

type DB = ReturnType<typeof actionDb> | PgliteDB;

const ORG_LABEL: Record<'buyer' | 'pg', string> = {
  buyer: '구매사',
  pg: 'PG사',
};

export async function approveWorkspaceAction(db: DB = actionDb(), workspaceId: string) {
  const session = await requireAdminSession();
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outbox = new DrizzleOutboxRepository(db as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx.update(workspaces)
      .set({ status: 'active', reviewedAt: now })
      .where(eq(workspaces.id, workspaceId));

    await tx.update(verificationApplications)
      .set({ status: 'approved', reviewedBy: session.adminId, reviewedAt: now })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'active' } },
    });

    // 승인 완료 이메일 — 신청자(admin 역할 멤버)에게 발송.
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
      const html = await renderWorkspaceApproved({
        workspaceName: ownerRow.wsName,
        orgLabel: ORG_LABEL[ownerRow.wsType as 'buyer' | 'pg'],
        loginUrl: `${baseUrl()}/login`,
      });
      await outbox.enqueue(
        {
          event: 'workspace.approved',
          to: ownerRow.email,
          subject: '[Supporter B] 가입이 승인되었습니다',
          html,
          dedupeKey: `workspace-approved:${workspaceId}`,
        },
        tx,
      );
    }
  });

  flushAfterCommit();
  revalidatePath('/admin/review');
  revalidatePath('/admin');
}
