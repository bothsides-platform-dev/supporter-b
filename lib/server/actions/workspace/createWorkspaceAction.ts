'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { actionDb, baseUrl } from '../auth/_shared';
import { createWorkspaceInTx } from './_createWorkspace';
import { notifyAdminNewSignupAfterCommit } from '@/lib/server/notifications/admin-signup';

const BizProfileInput = z
  .object({
    bizNo: z.string().min(8).max(20),
    taxType: z.enum(['general', 'simple', 'exempt']),
    status: z.enum(['active', 'suspended', 'closed']),
    // 등급은 admin 승인 시 지정 — 가입/워크스페이스 생성 시 사용자 입력 없음.
  })
  .strict();

const Input = z
  .object({
    type: z.enum(['buyer', 'pg']),
    name: z.string().min(1).max(200),
    bizProfile: BizProfileInput.optional(),
  })
  .strict();

export type CreateWorkspaceActionInput = z.input<typeof Input>;
export type CreateWorkspaceResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_INPUT' };

/**
 * Create a new workspace for the logged-in user (in-app, from the switcher).
 * The user becomes admin. DB-only — the caller follows up with
 * switchWorkspaceAction(workspaceId) to make the new ws active in the JWT.
 */
export async function createWorkspaceAction(
  input: CreateWorkspaceActionInput,
): Promise<CreateWorkspaceResult> {
  const session = await requireSession().catch(() => null);
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHENTICATED' };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const userId = session.user.id;
  const db = actionDb();
  const { workspaceId, applicationId } = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) =>
      createWorkspaceInTx(tx, {
        userId,
        type: parsed.data.type,
        name: parsed.data.name,
        bizProfile: parsed.data.bizProfile,
      }),
  );

  // New pending workspace → notify admins by email (post-commit, fire-and-forget).
  // The /admin review queue is the durable record; this is a best-effort nudge.
  notifyAdminNewSignupAfterCommit({
    workspaceName: parsed.data.name,
    orgType: parsed.data.type,
    reviewUrl: `${baseUrl()}/admin/review/${applicationId}`,
  });

  return { ok: true, workspaceId };
}
