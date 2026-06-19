'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { adminBaseUrl } from '@/lib/server/env';
import { notifyAdminNewSignupAfterCommit } from '@/lib/server/notifications/admin-signup';
import { getWorkspaceService } from '@/lib/server/services/workspace';
import { bizNoRefinement, BIZ_NO_ERROR } from '@/lib/validation/biz-no';

const BizProfileInput = z
  .object({
    bizNo: z.string().min(10).max(12).refine(bizNoRefinement, { message: BIZ_NO_ERROR }),
    taxType: z.enum(['general', 'simple', 'exempt']).optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
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
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_INPUT' | 'FORBIDDEN' };

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
  // 마스터/운영자 계정은 워크스페이스를 생성하지 않는다 — workspace_members 오염 방지.
  if (session.user.isMaster) return { ok: false, error: 'FORBIDDEN' };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const userId = session.user.id;
  const actor = { userId, workspaceId: '' };

  const service = await getWorkspaceService();
  const result = await service.createWorkspace(
    { userId, type: parsed.data.type, name: parsed.data.name, bizProfile: parsed.data.bizProfile },
    actor,
  );

  if (result.ok) {
    // New pending workspace → notify admins by email (post-commit, fire-and-forget).
    notifyAdminNewSignupAfterCommit({
      workspaceName: parsed.data.name,
      orgType: parsed.data.type,
      reviewUrl: `${adminBaseUrl()}/admin/review/${result.applicationId}`,
    });
    return { ok: true, workspaceId: result.workspaceId };
  }

  return { ok: false, error: 'INVALID_INPUT' };
}
