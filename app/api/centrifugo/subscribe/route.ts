/**
 * POST /api/centrifugo/subscribe — Centrifugo subscribe proxy ACL callback.
 *
 * This is the security boundary that keeps chat channels 완전 비공개. Centrifugo
 * calls this endpoint server-to-server whenever a connected client attempts to
 * subscribe to a channel. We answer allow/deny based ONLY on the request
 * payload's `user` (userId, from the connection JWT `sub`) + workspace
 * membership — there is NO browser session/cookie on a proxy call, so we must
 * NOT gate on `auth()`.
 *
 * Protocol (Centrifugo v6 proxy docs):
 *   - Request body: { client, transport, protocol, encoding, user, channel }.
 *     We only read `user` and `channel`.
 *   - Channel convention (single source: chatChannel()):
 *       chat:conversation:<conversationId>
 *   - Allow response body: { result: {} }
 *   - Deny  response body: { error: { code, message } }
 *   - HTTP status is ALWAYS 200. A non-200 is interpreted by Centrifugo as a
 *     proxy *transport* error, not a clean deny — so every response here is 200
 *     and allow/deny is carried in the JSON body.
 *
 * ACL: allow iff `user` is a member of the conversation's buyer OR pg
 * workspace. Every reject — non-member, missing/unknown conversation, non-chat
 * channel, malformed channel, missing field, bad JSON — returns the SAME
 * generic deny. We never distinguish "not found" from "forbidden": doing so
 * would leak whether a conversation exists, breaking the privacy invariant.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getChatConversationRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { chatChannel } from '@/lib/server/realtime/centrifugo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Single source for the channel prefix — stays in lockstep with chatChannel()
// by construction (chatChannel('') === 'chat:conversation:').
const CHANNEL_PREFIX = chatChannel('');

// Generic deny — identical for every reject branch (no existence leak).
function deny(): NextResponse {
  // HTTP 200 intentionally: Centrifugo carries allow/deny in the body, and a
  // non-200 is treated as a transport error, not a clean deny.
  return NextResponse.json({ error: { code: 403, message: 'permission denied' } });
}

function allow(): NextResponse {
  return NextResponse.json({ result: {} });
}

// We only need `user` + `channel` from the proxy payload.
const ProxySchema = z.object({
  user: z.string().min(1),
  channel: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return deny();
  }

  const parsed = ProxySchema.safeParse(payload);
  if (!parsed.success) return deny();

  const { user, channel } = parsed.data;

  // Reverse-parse the channel via the single-source convention.
  if (!channel.startsWith(CHANNEL_PREFIX)) return deny();
  const conversationId = channel.slice(CHANNEL_PREFIX.length);

  // Guard against non-uuid ids BEFORE hitting Postgres — findById('garbage')
  // would throw 22P02 (invalid_text_representation) on a uuid column.
  if (!z.string().uuid().safeParse(conversationId).success) return deny();

  try {
    const convRepo = await getChatConversationRepo();
    const conv = await convRepo.findById(conversationId);
    if (!conv) return deny();

    const wsRepo = await getWorkspaceRepo();
    const isMember =
      (await wsRepo.isMember(user, conv.buyerWsId)) ||
      (await wsRepo.isMember(user, conv.pgWsId));

    return isMember ? allow() : deny();
  } catch {
    // Any unexpected error → deny (fail closed). Never leak details.
    return deny();
  }
}
