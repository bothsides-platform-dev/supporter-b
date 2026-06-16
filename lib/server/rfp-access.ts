import type { RfpRepo, InvitationRepo } from './repositories/types';

export type RfpAccess =
  | { allowed: true }
  | { allowed: false; reason: 'RFP_NOT_FOUND' | 'FORBIDDEN' };

/**
 * RFP 접근권 단일 출처 — buyer-소유 / PG-초대 규칙.
 * TeamChatService.authorize 와 subscribe 프록시 authorizeTeamChannel 이 동일 로직을
 * 중복 갖던 것을 한 곳으로 추출. 주입 repo 만 받아 테스트 격리가 쉽다.
 */
export async function canWorkspaceAccessRfp(
  rfpRepo: Pick<RfpRepo, 'findById'>,
  invRepo: Pick<InvitationRepo, 'canAccess'>,
  rfpId: string,
  wsId: string,
): Promise<RfpAccess> {
  const rfp = await rfpRepo.findById(rfpId);
  if (!rfp) return { allowed: false, reason: 'RFP_NOT_FOUND' };
  if (rfp.buyerWsId === wsId) return { allowed: true };
  const invited = await invRepo.canAccess(rfpId, wsId);
  return invited ? { allowed: true } : { allowed: false, reason: 'FORBIDDEN' };
}
