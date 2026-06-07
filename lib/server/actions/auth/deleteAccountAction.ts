'use server';

import { requireSession } from '@/lib/auth/session';
import { getAuthService } from '@/lib/server/services/auth';
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

  const svc = await getAuthService();
  return svc.deleteAccount({ userId: session.user.id, plainPassword: input.password });
}
