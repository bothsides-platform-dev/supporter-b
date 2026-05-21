'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { requireSession } from '@/lib/auth/session';
import { workspaces } from '@/lib/db/schema';
import { generateToken } from '@/lib/server/token';
import { actionDb, baseUrl } from '@/lib/server/actions/auth/_shared';

export type RegenerateWorkspaceShareTokenResult =
  | { ok: true; shareUrl: string }
  | { ok: false; error: string };

/**
 * Admin-only: 워크스페이스 공용 초대 링크를 재발급한다. 기존 `shareToken` 을 새
 * 토큰으로 교체 → 유출된 옛 링크는 즉시 `SHARE_INVALID` 가 된다(만료가 없는 링크의
 * 유일한 무효화 수단). 새 URL을 반환하고 멤버 설정 페이지를 revalidate.
 */
export async function regenerateWorkspaceShareTokenAction(): Promise<RegenerateWorkspaceShareTokenResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  if (!session.user.workspaceId || session.user.role !== 'admin') {
    return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
  }

  const newToken = generateToken();
  await actionDb()
    .update(workspaces)
    .set({ shareToken: newToken })
    .where(eq(workspaces.id, session.user.workspaceId));

  revalidatePath('/settings/members');
  return { ok: true, shareUrl: `${baseUrl()}/share/workspace/${newToken}` };
}
