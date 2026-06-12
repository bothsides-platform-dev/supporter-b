'use server';

import { requireSession } from '@/lib/auth/session';
import { getAuthService } from '@/lib/server/services/auth';
import type { WorkspaceStub } from './getDeleteAccountStatus';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_PASSWORD' | 'MASTER_ACCOUNT' }
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

  // 마스터/운영자 계정은 삭제 불가 — env allowlist로 수명 관리.
  if (session.user.isMaster) return { ok: false, error: 'MASTER_ACCOUNT' };

  const svc = await getAuthService();
  return svc.deleteAccount({ userId: session.user.id, plainPassword: input.password });
}
