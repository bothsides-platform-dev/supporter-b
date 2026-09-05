'use server';

import { z } from 'zod';
import { getMembership, isApprovedAdmin } from '@/lib/auth/active-workspace';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
import { requireSession } from '@/lib/auth/session';
import { getWorkspaceService } from '@/lib/server/services/workspace';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ name: z.string().trim().min(1).max(200) }).strict();

export type RequestWorkspaceNameChangeResult = ActionResult;

export async function requestWorkspaceNameChangeAction(input: { name: string }): Promise<RequestWorkspaceNameChangeResult> {
  const session = await requireSession().catch(() => null);
  if (!session?.user?.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  if (!isMasterEmail(session.user.email)) {
    const membership = await getMembership(session.user.id, session.user.workspaceId);
    if (!isApprovedAdmin(membership)) return { ok: false, error: 'FORBIDDEN' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const result = await (await getWorkspaceService()).requestNameChange(
    { userId: session.user.id, workspaceId: session.user.workspaceId },
    parsed.data.name,
  );
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
