import { requireBuyerSession, requirePgSession, requireSession } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import type { WorkspaceType } from '@/lib/types/workspace';

// `email` 은 마스터/운영자 면제 판정(isMasterEmail)에 쓴다 — 마스터는 워크스페이스에
// synthetic admin 으로 진입해 `workspace_members` row 를 갖지 않으므로, 멤버십을
// 읽어 판정하는 게이트는 이메일로 따로 면제해야 한다.
export type ActorResult =
  | { ok: true; userId: string; workspaceId: string; email: string }
  | { ok: false; error: string };

/** Resolve the caller as a buyer actor. Returns FORBIDDEN_BUYER on failure. */
export async function requireBuyerActor(): Promise<ActorResult> {
  try {
    const s = await requireBuyerSession();
    return {
      ok: true,
      userId: s.user.id,
      workspaceId: s.user.workspaceId,
      email: s.user.email,
    };
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }
}

/** Resolve the caller as a PG actor. Returns FORBIDDEN_PG on failure. */
export async function requirePgActor(): Promise<ActorResult> {
  try {
    const s = await requirePgSession();
    return {
      ok: true,
      userId: s.user.id,
      workspaceId: s.user.workspaceId,
      email: s.user.email,
    };
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }
}

export type WorkspaceActorResult =
  | { ok: true; userId: string; workspaceId: string; workspaceType: WorkspaceType }
  | { ok: false; error: string };

/** Resolve any authenticated workspace member including workspaceType.
 *  Superset of requireWorkspaceActor — use where workspaceType is needed. */
export async function requireActiveWorkspace(): Promise<WorkspaceActorResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const { id, workspaceId, workspaceType } = session.user;
  if (!workspaceId || !workspaceType) return { ok: false, error: 'NO_WORKSPACE' };
  // PG 멤버십 승인 게이트 — requirePgSession 과 동일 경계. 이 헬퍼를 지나는
  // 양측 공용 표면(채팅·보드·계약 취소/재발송/리마인드)도 미승인 PG 멤버에게
  // 열리지 않는다. buyer 는 판정 함수 안에서 즉시 통과(승인 개념 없음).
  if (await isPgMembershipBlocked(session)) {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }
  return { ok: true, userId: id, workspaceId, workspaceType };
}
