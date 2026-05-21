'use server';

import { requireSession } from '@/lib/auth/session';
import { workspaceMembers } from '@/lib/db/schema';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type ClaimWorkspaceShareTokenResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

/**
 * 워크스페이스 공용 초대 링크(raw `shareToken`) 클레임. 인증된 사용자라면 누구나
 * 해당 워크스페이스에 멤버로 합류한다 — 이메일 허용목록 없이 링크 소지만으로 진입.
 *
 * 흐름:
 *   1. session 필수(`UNAUTHENTICATED`).
 *   2. `workspaceRepo.findByShareToken(rawToken)` — 매칭 ws 조회. 없으면 `SHARE_INVALID`.
 *   3. `workspace_members` insert + `onConflictDoNothing` — PK `(workspace_id, user_id)`
 *      가 idempotency 보장(이미 멤버면 no-op). 멤버십 row 자체가 합류 기록이라
 *      별도 audit row 없음.
 *
 * buyer/pg 타입 게이트 없음 — 멤버 초대는 한 워크스페이스에 사람을 추가하는 행위라
 * acceptWorkspaceInviteAction 과 동일하게 타입을 가리지 않는다(RFP 공유 링크와 다름).
 */
export async function claimWorkspaceShareTokenAction(
  rawToken: string,
): Promise<ClaimWorkspaceShareTokenResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false, error: 'SHARE_INVALID' };
  }

  const ws = await (await getWorkspaceRepo()).findByShareToken(rawToken);
  if (!ws) return { ok: false, error: 'SHARE_INVALID' };

  const db = actionDb();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: ws.id, userId: session.user.id, role: 'member' })
    .onConflictDoNothing();

  return { ok: true, workspaceId: ws.id };
}
