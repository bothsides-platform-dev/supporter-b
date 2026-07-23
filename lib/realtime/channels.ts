/** Channel name for a conversation. Single source so the subscribe proxy and
 *  publish stay in lockstep. */
export function chatChannel(conversationId: string): string {
  return `chat:conversation:${conversationId}`;
}

/** RFP-scoped internal team thread channel namespace. The wsId suffix keeps
 *  the buyer team and each PG team on disjoint channels (sealed-bid invariant
 *  — the subscribe proxy enforces membership + RFP access per side). */
export const TEAM_CHANNEL_PREFIX = 'team:rfp:';

/** Channel name for an (rfp, workspace) team thread. Single source so the
 *  subscribe proxy and publish stay in lockstep. */
export function teamChatChannel(rfpId: string, workspaceId: string): string {
  return `${TEAM_CHANNEL_PREFIX}${rfpId}:${workspaceId}`;
}

/** Workspace presence namespace prefix — the subscribe proxy dispatches on it. */
export const PRESENCE_CHANNEL_PREFIX = 'presence:ws:';

/** Channel name for a workspace's presence broadcast. Single source so the
 *  self-broadcast client, observers, and the subscribe proxy stay in lockstep.
 *  ACL'd namespace (관계 게이트: 멤버십∨대화∨초대∨pending 콜드피치) — 공개(D1)
 *  모델이 노출하던 관찰자 신원(경쟁사-집합 신호)을 닫는다. 이력·판단 기록은
 *  docs/THREAT_MODEL.md §2.3(AR-1)·§2.6. */
export function presenceWsChannel(workspaceId: string): string {
  return `${PRESENCE_CHANNEL_PREFIX}${workspaceId}`;
}
