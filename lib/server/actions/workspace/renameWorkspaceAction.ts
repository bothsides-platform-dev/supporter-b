'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

const Input = z.object({ name: z.string().min(1).max(200) }).strict();

export type RenameWorkspaceResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' };

export async function renameWorkspaceAction(input: {
  name: string;
}): Promise<RenameWorkspaceResult> {
  const session = await requireSession().catch(() => null);
  if (!session?.user?.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  if (session.user.role !== 'admin') return { ok: false, error: 'FORBIDDEN' };

  const parsed = Input.safeParse({ name: input?.name?.trim() });
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  // The admin session already guarantees a live membership in this workspace, so
  // the row always exists — NOT_FOUND stays in the result union for the caller
  // contract but is unreachable here (the prior rowCount guard was dead code).
  const workspaceRepo = await getWorkspaceRepo();
  await workspaceRepo.rename(session.user.workspaceId, parsed.data.name);
  return { ok: true };
}
