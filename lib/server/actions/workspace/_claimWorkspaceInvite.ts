/**
 * 워크스페이스 초대 원자적 클레임 헬퍼.
 *
 * acceptWorkspaceInviteAction (기존 유저)과
 * signupViaWorkspaceInviteAction (신규 가입)이 공유하는 in-tx 로직.
 *
 * 사전 조건(INVITE_INVALID, INVITE_EXPIRED fast-path, INVITE_EMAIL_MISMATCH)은
 * 각 action에서 tx 전에 처리. 이 헬퍼는 tx 안에서 원자적으로:
 *   - 초대 status를 'accepted'로 업데이트 (조건부 UPDATE로 TOCTOU 방지)
 *   - workspace_members 삽입 (onConflictDoNothing)
 *
 * @returns ok:true → 클레임 성공, workspaceId 반환
 * @returns INVITE_EXPIRED → 동시 요청이 먼저 클레임했거나 만료됨
 */
import { and, eq, gt, sql } from 'drizzle-orm';
import { users, workspaceInvitations, workspaceMembers } from '@/lib/db/schema';

export type InvitationClaimInput = {
  id: string;
  workspaceId: string;
  role: 'admin' | 'member';
  expiresAt: Date;
};

export type ClaimInviteResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: 'INVITE_EXPIRED' };

export async function claimInviteInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  invitation: InvitationClaimInput,
  userId: string,
): Promise<ClaimInviteResult> {
  // 조건부 UPDATE — status='pending' AND expires_at > now() 조건이 원자적 직렬화 지점.
  // 동시 요청이 사전 체크를 통과해도 여기서 한 명만 성공.
  const [claimed] = await tx
    .update(workspaceInvitations)
    .set({ status: 'accepted', acceptedByUserId: userId })
    .where(
      and(
        eq(workspaceInvitations.id, invitation.id),
        eq(workspaceInvitations.status, 'pending'),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    )
    .returning({ id: workspaceInvitations.id });

  if (!claimed) {
    // 동시 요청이 먼저 클레임했거나 만료됨
    return { ok: false, error: 'INVITE_EXPIRED' };
  }

  // 워크스페이스 멤버십 추가 — onConflictDoNothing으로 중복 멤버 race 처리
  await tx
    .insert(workspaceMembers)
    .values({
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
    })
    .onConflictDoNothing();

  // 이메일 인증 — 초대 링크가 invitedEmail 메일함으로 배달됐고(소유 증명),
  // 클레임 시점엔 user.email == invitedEmail 이 보장된다(각 action의 사전 검사).
  // 이미 인증된 유저면 no-op(WHERE 가드).
  await tx
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: sql`now()` })
    .where(and(eq(users.id, userId), eq(users.emailVerified, false)));

  return { ok: true, workspaceId: invitation.workspaceId };
}
