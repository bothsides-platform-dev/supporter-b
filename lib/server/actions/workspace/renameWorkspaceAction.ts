'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { getMembership, isApprovedAdmin } from '@/lib/auth/active-workspace';
import { isMasterEmail } from '@/lib/auth/master-allowlist';

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
  //
  // 마스터/운영자는 면제한다 — 멤버십 row 가 없어 getMembership 이 null 이다. 설정
  // 페이지는 세 컨트롤(로고·이름·사업자번호)에 마스터 면제를 포함한 **한 값**을
  // 내려 주므로, 이 액션만 면제가 없으면 마스터에게 버튼은 보이는데 저장은 항상
  // 거부되는 막다른 길이 된다(로고 라우트·updateWorkspaceBizProfileAction 과 정렬).
  if (!isMasterEmail(session.user.email)) {
    const membership = await getMembership(session.user.id, session.user.workspaceId);
    if (!isApprovedAdmin(membership)) return { ok: false, error: 'FORBIDDEN' };
  }

  const parsed = Input.safeParse({ name: input?.name?.trim() });
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  // The admin session already guarantees a live membership in this workspace, so
  // the row always exists — NOT_FOUND stays in the result union for the caller
  // contract but is unreachable here (the prior rowCount guard was dead code).
  const workspaceRepo = await getWorkspaceRepo();
  await workspaceRepo.rename(session.user.workspaceId, parsed.data.name);
  return { ok: true };
}
