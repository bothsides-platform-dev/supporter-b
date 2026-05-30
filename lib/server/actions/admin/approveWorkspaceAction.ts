'use server';

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  workspaces,
  verificationApplications,
  adminAuditLogs,
  workspaceMembers,
  users,
  bizProfiles,
} from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb, baseUrl } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { renderWorkspaceApproved } from '@/lib/server/outbox/templates/workspaceApproved';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import type { MerchantGrade } from '@/lib/types/biz-profile';

type DB = ReturnType<typeof actionDb> | PgliteDB;

const ORG_LABEL: Record<'buyer' | 'pg', string> = {
  buyer: '구매사',
  pg: 'PG사',
};

/**
 * admin이 workspace를 승인한다.
 *
 * buyer 워크스페이스인 경우:
 *   - grade 필수. biz_profiles 행을 INSERT(기존 bizNo/taxType/status 복사 +
 *     grade + gradeSource:'admin_confirmed')하고 workspaces.bizProfileId를 스왑.
 *   - biz_profiles가 없는 레거시 row는 grade-only INSERT로 CHECK 충족.
 *   - gradeConfirmedBy는 null — admin 세션 id가 users FK와 맞지 않으므로
 *     감사 로그(adminAuditLogs payload)가 source of truth.
 * pg 워크스페이스인 경우 grade 없이 승인.
 */
export async function approveWorkspaceAction(
  db: DB = actionDb(),
  workspaceId: string,
  grade?: MerchantGrade,
) {
  const session = await requireAdminSession();
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outbox = new DrizzleOutboxRepository(db as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    // workspace 조회 — type + 현재 bizProfileId 확인
    const [ws] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!ws) throw new Error(`workspace not found: ${workspaceId}`);

    // buyer 승인 시 grade 필수
    if (ws.type === 'buyer') {
      if (!grade) throw new Error('GRADE_REQUIRED');
    }

    // buyer: 새 biz_profiles 행 INSERT + bizProfileId 스왑 (불변 패턴)
    let newBizProfileId: string | null = null;
    if (ws.type === 'buyer' && grade) {
      // 기존 biz_profiles 행이 있으면 bizNo/taxType/status 복사
      let existingBizNo: string | null = null;
      let existingTaxType: string | null = null;
      let existingStatus: string | null = null;
      if (ws.bizProfileId) {
        const [existing] = await tx
          .select()
          .from(bizProfiles)
          .where(eq(bizProfiles.id, ws.bizProfileId))
          .limit(1);
        if (existing) {
          existingBizNo = existing.bizNo ?? null;
          existingTaxType = existing.taxType ?? null;
          existingStatus = existing.status ?? null;
        }
      }

      newBizProfileId = randomUUID();
      await tx.insert(bizProfiles).values({
        id: newBizProfileId,
        bizNo: existingBizNo,
        taxType: existingTaxType,
        status: existingStatus,
        grade,
        gradeSource: 'admin_confirmed',
        gradeConfirmedBy: null, // admin FK는 users 테이블 아님 → 감사로그로 기록
        gradeConfirmedAt: now,
      });
    }

    await tx.update(workspaces)
      .set({
        status: 'active',
        reviewedAt: now,
        ...(newBizProfileId ? { bizProfileId: newBizProfileId } : {}),
      })
      .where(eq(workspaces.id, workspaceId));

    await tx.update(verificationApplications)
      .set({ status: 'approved', reviewedBy: session.adminId, reviewedAt: now })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: {
        after: { status: 'active' },
        ...(grade ? { grade } : {}),
      },
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
