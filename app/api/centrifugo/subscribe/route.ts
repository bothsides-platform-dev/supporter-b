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
 *   - Channel conventions (single sources: chatChannel() / teamChatChannel()):
 *       chat:conversation:<conversationId>
 *       team:rfp:<rfpId>:<workspaceId>
 *   - Allow response body: { result: {} }
 *   - Deny  response body: { error: { code, message } }
 *   - HTTP status is ALWAYS 200. A non-200 is interpreted by Centrifugo as a
 *     proxy *transport* error, not a clean deny — so every response here is 200
 *     and allow/deny is carried in the JSON body.
 *
 * ACL:
 *   chat — allow iff `user` is a member of the conversation's buyer OR pg
 *   workspace.
 *   team — allow iff `user` is a member of <workspaceId> AND that workspace
 *   has access to <rfpId> (buyer owns it, or PG holds an invitation —
 *   invRepo.canAccess, the same gate as the PG inbox detail loader). The wsId
 *   segment keeps buyer/PG team threads on disjoint channels: a user with
 *   legitimate access to the SAME RFP from the other side must still deny
 *   (sealed-bid invariant).
 *
 * Every reject — non-member, missing/unknown conversation or rfp, non-chat
 * channel, malformed channel, missing field, bad JSON — returns the SAME
 * generic deny. We never distinguish "not found" from "forbidden": doing so
 * would leak whether a conversation exists, breaking the privacy invariant.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getChatConversationRepo,
  getInvitationRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  chatChannel,
  TEAM_CHANNEL_PREFIX,
} from '@/lib/server/realtime/centrifugo';

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

  if (channel.startsWith(TEAM_CHANNEL_PREFIX)) {
    return authorizeTeamChannel(user, channel);
  }

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

// team:rfp:<rfpId>:<workspaceId> — RFP 팀 채팅 채널 ACL (header doc 참조).
async function authorizeTeamChannel(
  user: string,
  channel: string,
): Promise<NextResponse> {
  const parts = channel.slice(TEAM_CHANNEL_PREFIX.length).split(':');
  if (parts.length !== 2) return deny();
  const [rfpId, workspaceId] = parts;
  // uuid-gate BEFORE Postgres (22P02 guard), anchored ^…$ — no smuggling.
  if (!z.string().uuid().safeParse(rfpId).success) return deny();
  if (!z.string().uuid().safeParse(workspaceId).success) return deny();

  try {
    const wsRepo = await getWorkspaceRepo();
    if (!(await wsRepo.isMember(user, workspaceId))) return deny();

    const rfp = await (await getRfpRepo()).findById(rfpId);
    if (!rfp) return deny();
    if (rfp.buyerWsId === workspaceId) return allow();

    const invited = await (await getInvitationRepo()).canAccess(rfpId, workspaceId);
    return invited ? allow() : deny();
  } catch {
    // Any unexpected error → deny (fail closed). Never leak details.
    return deny();
  }
}
