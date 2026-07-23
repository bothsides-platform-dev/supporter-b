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

/** Channel name for a workspace's presence broadcast. Single source so the
 *  self-broadcast client and observers stay in lockstep. PUBLIC namespace —
 *  accepted risk AR-1 (observer-identity exposure): any authenticated raw WS
 *  client knowing a workspace UUID can enumerate its online userIds + observer
 *  identities via sub.presence(). See docs/THREAT_MODEL.md §2.3 (deferred
 *  proxy-ACL design: §2.6). */
export function presenceWsChannel(workspaceId: string): string {
  return `presence:ws:${workspaceId}`;
}
