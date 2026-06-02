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
  | { type: 'read'; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

/** Channel name for a conversation. Single source so the subscribe proxy and
 *  publish stay in lockstep. */
export function chatChannel(conversationId: string): string {
  return `chat:conversation:${conversationId}`;
}

/**
 * Publish an event to a conversation's channel. Best-effort: resolves to
 * undefined whether or not delivery happened. Never throws.
 */
export async function publishChatEvent(
  conversationId: string,
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
        params: { channel: chatChannel(conversationId), data },
      }),
    });
  } catch {
    // Best-effort: persistence already succeeded in Postgres; a missed fanout
    // is recovered by the client's REST history load on next connect.
  }
}
