// 아바타 클릭 신원 카드용 ACL 로더 — server-only (repo factory import).
//
// 어떤 화면의 어떤 아바타든 userId 하나로 이 로더를 거쳐 사람 정보를 얻는다. 이메일은
// 민감 데이터이므로 임의 userId 열람을 막아야 한다(봉인입찰: 누가 누구와 거래하는지 +
// 담당자 연락처가 새면 안 됨). 그래서 관계를 fail-closed 로 판정하고, 관계가 없으면
// 이메일은커녕 "그 유저가 존재하는지"조차 노출하지 않는다(ok:false). loadPgRfpDetail 의
// 서버 strip 과 같은 철학 — 렌더 게이트가 아니라 데이터 경계에서 막는다.
//
// auth-free: actor 는 호출 액션이 세션에서 해소해 넘긴다. 덕분에 pglite + seed 로
// auth mock 없이 단위 테스트 가능하다(rfp-detail-loader 컨벤션).
import {
  getChatConversationRepo,
  getUserRepo,
  getWorkspaceRepo,
} from './repositories/factory';
import type { WorkspaceType } from '@/lib/types/workspace';

export type UserProfileRelationship = 'self' | 'teammate' | 'counterparty';

export type UserProfileForViewer = {
  userId: string;
  name: string;
  email: string;
  avatarUpdatedAt: string | null;
  relationship: UserProfileRelationship;
  /** 온라인 점을 읽을 presence:ws 채널 — 본인/동료는 내 ws, 상대는 상대 ws. */
  presenceWorkspaceId: string;
  /** counterparty 일 때만 — 메시지 컴포즈/표시용 상대 워크스페이스 정보. */
  workspace?: { id: string; name: string; type: WorkspaceType; logoUpdatedAt: string | null };
};

export type LoadUserProfileResult =
  | { ok: true; profile: UserProfileForViewer }
  | { ok: false };

export type ProfileActor = {
  userId: string;
  workspaceId: string;
  workspaceType: WorkspaceType;
};

/**
 * 뷰어(actor)가 targetUserId 의 신원 카드를 볼 자격이 있는지 판정하고, 있으면 화이트리스트
 * 필드만 반환한다. 관계 우선순위: self → teammate(같은 ws) → counterparty(대화 있는 상대 ws).
 * 어디에도 해당 없으면 ok:false (이메일·존재 비노출).
 */
export async function loadUserProfileForViewer(
  actor: ProfileActor,
  targetUserId: string,
): Promise<LoadUserProfileResult> {
  const [userRepo, wsRepo] = await Promise.all([getUserRepo(), getWorkspaceRepo()]);

  // 관계 판정 — 이 단계까지 통과해야 비로소 이메일을 읽는다.
  let relationship: UserProfileRelationship | null = null;
  let counterpartyWsId: string | null = null;

  if (targetUserId === actor.userId) {
    relationship = 'self';
  } else if (await wsRepo.isMember(targetUserId, actor.workspaceId)) {
    relationship = 'teammate';
  } else {
    // 대화가 존재하는 상대 워크스페이스의 멤버인가? (sealed-bid: PG↔PG/buyer↔buyer 대화는
    // 애초에 불가능하므로 여기서 떠올릴 상대는 반대 유형뿐)
    const convRepo = await getChatConversationRepo();
    const convos = await convRepo.listForWorkspace(actor.workspaceId, actor.workspaceType);
    const cpIds = new Set(
      convos.map((c) => (actor.workspaceType === 'buyer' ? c.pgWsId : c.buyerWsId)),
    );
    for (const cpId of cpIds) {
      if (await wsRepo.isMember(targetUserId, cpId)) {
        relationship = 'counterparty';
        counterpartyWsId = cpId;
        break;
      }
    }
  }

  if (!relationship) return { ok: false };

  // findProfileById 는 시스템/마스터 계정을 fail-closed 로 제외한다 — canonical PG/데모
  // 워크스페이스의 admin 은 isSystemAccount=true 인 실제 멤버라 isMember 는 통과하지만,
  // 그 (마스터/시드) 이메일을 신원 카드로 노출해선 안 된다. 행이 없거나 시스템 계정이면 비노출.
  const user = await userRepo.findProfileById(targetUserId);
  if (!user) return { ok: false };

  const base = {
    userId: user.id,
    name: user.name,
    email: user.email,
    avatarUpdatedAt: user.avatarUpdatedAt,
  };

  if (relationship === 'counterparty' && counterpartyWsId) {
    const ws = await wsRepo.getDisplayInfo(counterpartyWsId);
    if (!ws) return { ok: false };
    return {
      ok: true,
      profile: { ...base, relationship, presenceWorkspaceId: ws.id, workspace: ws },
    };
  }

  return {
    ok: true,
    profile: { ...base, relationship, presenceWorkspaceId: actor.workspaceId },
  };
}
