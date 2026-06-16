// Team-chat email digest keys + window — PURE (no next-auth/session imports) so
// both TeamChatService and the team-digest flush processor can import it without
// pulling the action layer. Mirrors the chat-digest scheme but the scope key
// carries (rfpId, workspaceId, recipientUserId) since a team thread is keyed by
// (rfp, workspace), not by a single conversation id.
export const TEAM_DIGEST_WINDOW_MS = 3 * 60_000;

export function teamDigestBucket(now: Date): number {
  return Math.floor(now.getTime() / TEAM_DIGEST_WINDOW_MS);
}
export function teamDigestWindowEnd(now: Date): Date {
  return new Date((teamDigestBucket(now) + 1) * TEAM_DIGEST_WINDOW_MS);
}
/** `team-digest:<rfpId>:<workspaceId>:<recipientUserId>:<bucket>` */
export function teamDigestDedupeKey(rfpId: string, workspaceId: string, recipientUserId: string, now: Date): string {
  return `team-digest:${rfpId}:${workspaceId}:${recipientUserId}:${teamDigestBucket(now)}`;
}
export function parseTeamDigestDedupeKey(dedupeKey: string | undefined): { rfpId: string; workspaceId: string; recipientUserId: string } | null {
  if (!dedupeKey) return null;
  const parts = dedupeKey.split(':');
  if (parts.length !== 5 || parts[0] !== 'team-digest') return null;
  const [, rfpId, workspaceId, recipientUserId] = parts;
  if (!rfpId || !workspaceId || !recipientUserId) return null;
  return { rfpId, workspaceId, recipientUserId };
}
