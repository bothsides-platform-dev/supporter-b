// Best-effort Centrifugo fanout.
//
// Self-hosted Postgres is the canonical message store (PIPA/PG 자사 보관 hard
// constraint). Centrifugo never persists — it only fans out live to subscribers.
// So publish is strictly best-effort: it must never block or fail a message
// send. When the env is unconfigured (every unit test, and any environment
// without the realtime server) it no-ops. Transport errors are swallowed and
// logged, not thrown.
//
// Channel convention: `chat:conversation:<conversationId>` (subscribe ACL is
// enforced app-side via the Centrifugo subscribe proxy callback — see impl-plan
// §실시간 전송). Events: message / read / typing (typing is normally a client
// ephemeral publish, but the server may publish read receipts here too).

export type ChatRealtimeEvent =
  | { type: 'message'; id: string; [k: string]: unknown }
  | { type: 'read'; userId: string; readAt: string; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

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

/** Shared best-effort publish body — both channel families fan out the same way. */
async function publishToChannel(
  channel: string,
  data: ChatRealtimeEvent,
): Promise<void> {
  const apiUrl = process.env.CENTRIFUGO_HTTP_API_URL;
  const apiKey = process.env.CENTRIFUGO_API_KEY;
  // Unconfigured → no realtime server present → no-op.
  if (!apiUrl || !apiKey) return;

  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        method: 'publish',
        params: { channel, data },
      }),
      // 전송 액션이 publish 를 await 한다 — Centrifugo 가 거부가 아니라 '행'으로
      // 멈추면 catch 가 못 잡으므로, 타임아웃으로 사용자 응답이 붙들리지 않게 한다.
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    // Best-effort: persistence already succeeded in Postgres; a missed fanout
    // is recovered by the client's REST history load on next connect.
    console.warn('[centrifugo] publish failed', err);
  }
}

/**
 * Publish an event to a conversation's channel. Best-effort: resolves to
 * undefined whether or not delivery happened. Never throws.
 */
export async function publishChatEvent(
  conversationId: string,
  data: ChatRealtimeEvent,
): Promise<void> {
  await publishToChannel(chatChannel(conversationId), data);
}

/**
 * Publish an event to an (rfp, workspace) team thread channel. Best-effort,
 * mirroring publishChatEvent.
 */
export async function publishTeamChatEvent(
  rfpId: string,
  workspaceId: string,
  data: ChatRealtimeEvent,
): Promise<void> {
  await publishToChannel(teamChatChannel(rfpId, workspaceId), data);
}

// Centrifugo `presence` response: `result.presence` is a map keyed by client id,
// each value carrying the connection's `user`. See centrifugal.dev server API.
interface CentrifugoPresenceResponse {
  result?: { presence?: Record<string, { user?: string }> };
}

/**
 * Whether `userId` currently has a live connection subscribed to the
 * conversation's channel (i.e. is online in this thread). Powers email-blast
 * suppression: an online recipient gets the live fanout, no mail.
 *
 * Best-effort, mirroring publishChatEvent. **Safe default is `false`** — when
 * Centrifugo is unconfigured, returns an error object, or the request throws,
 * we treat the user as offline (= do NOT suppress the mail). Suppressing on a
 * false positive would silently drop a notification; the inverse only sends a
 * mail the recipient may not strictly need.
 */
export async function isUserPresentInConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const apiUrl = process.env.CENTRIFUGO_HTTP_API_URL;
  const apiKey = process.env.CENTRIFUGO_API_KEY;
  // Unconfigured → no realtime server present → treat as offline (don't suppress).
  if (!apiUrl || !apiKey) return false;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        method: 'presence',
        params: { channel: chatChannel(conversationId) },
      }),
    });
    const json = (await res.json()) as CentrifugoPresenceResponse;
    const presence = json.result?.presence;
    if (!presence) return false;
    return Object.values(presence).some((client) => client.user === userId);
  } catch {
    // Best-effort: any transport/parse error degrades to offline (don't suppress).
    return false;
  }
}
