'use server';

import { requireSession } from '@/lib/auth/session';
import { getInvitationRepo, getRfpRepo } from '@/lib/server/repositories/factory';
import { hashToken } from '@/lib/server/token';
import { getMembership } from '@/lib/auth/active-workspace';
import { actionDb } from '../auth/_shared';

// `rfpId` here is the human RFP code (P-YYMM-NNNN) — the URL identifier the
// caller redirects to (/inbox/[code]). Internal FKs use the uuid.
// `switchTo` is set when the caller is a member of the invited PG workspace but
// it is not their currently-active one — the client must switchWorkspaceAction
// into it before navigating to the inbox (which is scoped to the active ws).
export type ClaimInviteTokenResult =
  | { ok: true; rfpId: string; alreadyClaimed?: boolean; switchTo?: string }
  | { ok: false; error: string };

/**
 * RFP 초대 토큰 클레임 — 인증된 사용자가 raw 토큰을 제시.
 *
 * 흐름:
 *   1) requireSession().
 *   2) `findByTokenHash(hash(rawToken))` — invitation 조회. 없으면 INVITE_INVALID.
 *   3) 워크스페이스 멤버십 검사: inv.pgWsId !== session.user.workspaceId
 *      → INVITE_NOT_MEMBER.
 *   4) `claimToken(rawToken, userId)` atomic — 만료/사용/무효 분기.
 *      'used' 인데 같은 PG ws 동료가 이미 클레임한 경우 → 정책상 멤버 모두 접근
 *      가능하므로 ok=true + alreadyClaimed=true 로 반환해 인박스로 redirect 시킨다.
 */
export async function claimInviteTokenAction(
  rawToken: string,
): Promise<ClaimInviteTokenResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false, error: 'INVITE_INVALID' };
  }

  const invRepo = await getInvitationRepo();
  const tokenHash = hashToken(rawToken);

  // 1. invitation row 조회.
  const inv = await invRepo.findByTokenHash(tokenHash);
  if (!inv) return { ok: false, error: 'INVITE_INVALID' };

  // 2. 워크스페이스 멤버십 검사 — 초대된 PG ws 에 '소속된' 사용자만 통과.
  // (활성 ws 일치가 아니라 멤버십 기준 — 한 유저가 여러 ws 소속 가능. 정책 #11.)
  if (!inv.pgWsId) return { ok: false, error: 'INVITE_NOT_MEMBER' };
  const membership = await getMembership(actionDb(), session.user.id, inv.pgWsId);
  if (!membership) return { ok: false, error: 'INVITE_NOT_MEMBER' };

  // 멤버지만 활성 ws 가 다르면 클라이언트가 인박스 진입 전 전환해야 한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeWsId = (session.user as any).workspaceId as string | undefined;
  const switchTo = activeWsId !== inv.pgWsId ? inv.pgWsId : undefined;

  // RFP code(URL 식별자) 해석 — inv.rfpId 는 uuid.
  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findById(inv.rfpId);
  const rfpCode = rfp?.code ?? inv.rfpId;

  // 3. atomic claim.
  const claim = await invRepo.claimToken(rawToken, session.user.id);
  if (!claim.ok) {
    if (claim.reason === 'expired') return { ok: false, error: 'INVITE_EXPIRED' };
    if (claim.reason === 'used') {
      // 동료가 이미 클레임 — 멤버이므로 인박스로 안내(에러 X).
      return { ok: true, rfpId: rfpCode, alreadyClaimed: true, switchTo };
    }
    return { ok: false, error: 'INVITE_INVALID' };
  }

  return { ok: true, rfpId: rfpCode, switchTo };
}
