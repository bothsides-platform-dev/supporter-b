'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { getMembership, isApprovedAdmin } from '@/lib/auth/active-workspace';

const Input = z.object({ name: z.string().min(1).max(200) }).strict();

export type RenameWorkspaceResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' };

export async function renameWorkspaceAction(input: {
  name: string;
}): Promise<RenameWorkspaceResult> {
  const session = await requireSession().catch(() => null);
  if (!session?.user?.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  // JWT role 은 stale 가능 + 미승인 admin 포함 가능 → DB 에서 승인된 admin 인지 재확인.
  const membership = await getMembership(session.user.id, session.user.workspaceId);
  if (!isApprovedAdmin(membership)) return { ok: false, error: 'FORBIDDEN' };

  const parsed = Input.safeParse({ name: input?.name?.trim() });
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  // The admin session already guarantees a live membership in this workspace, so
  // the row always exists — NOT_FOUND stays in the result union for the caller
  // contract but is unreachable here (the prior rowCount guard was dead code).
  const workspaceRepo = await getWorkspaceRepo();
  await workspaceRepo.rename(session.user.workspaceId, parsed.data.name);
  return { ok: true };
}
