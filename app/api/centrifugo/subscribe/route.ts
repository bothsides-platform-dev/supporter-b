/**
 * POST /api/centrifugo/subscribe — Centrifugo subscribe proxy ACL callback.
 *
 * This is the security boundary that keeps chat channels 완전 비공개. Centrifugo
 * calls this endpoint server-to-server whenever a connected client attempts to
 * subscribe to a channel. We answer allow/deny based ONLY on the request
 * payload's `user` (JWT `sub`) + server-only `meta.workspaceId` (connection JWT)
 * — there is NO browser session/cookie on a proxy call, so we must NOT gate on
 * `auth()`.
 *
 * Protocol (Centrifugo v6 proxy docs):
 *   - Request body includes { user, channel, meta } because config enables
 *     `include_connection_meta`. We require signed `meta.workspaceId`.
 *   - Channel conventions (single sources: chatChannel() / teamChatChannel() /
 *     presenceWsChannel()):
 *       chat:conversation:<conversationId>
 *       team:rfp:<rfpId>:<workspaceId>
 *       presence:ws:<workspaceId>
 *   - Allow response body: { result: {} }
 *   - Deny  response body: { error: { code, message } }
 *   - HTTP status is ALWAYS 200. A non-200 is interpreted by Centrifugo as a
 *     proxy *transport* error, not a clean deny — so every response here is 200
 *     and allow/deny is carried in the JSON body.
 *
 * ACL:
 *   Every namespace first requires an active signed workspace membership; PG
 *   memberships must be approved.
 *   chat — allow iff the signed workspace is one side of the conversation.
 *   team — allow iff signed workspace equals <workspaceId> AND that workspace
 *   has access to <rfpId> (buyer owns it, or PG holds an invitation —
 *   invRepo.canAccess, the same gate as the PG inbox detail loader). The wsId
 *   segment keeps buyer/PG team threads on disjoint channels: a user with
 *   legitimate access to the SAME RFP from the other side must still deny
 *   (sealed-bid invariant).
 *   presence — allow iff `user` has a business relationship with <workspaceId>:
 *   membership ∨ conversation ∨ RFP-invitation pair ∨ pending cold-pitch pair
 *   (PresenceAccessRepo.canObserve, 방향 대칭). D1 의 완전 공개 모델을 대체 —
 *   공개 채널의 presence() 맵이 "이 구매사 딜을 지금 보는 PG 집합"(경쟁사-집합
 *   신호)을 노출하던 것을 닫는다. docs/THREAT_MODEL.md §2.3(AR-1)·§2.6 참조.
 *
 * Every reject — non-member, missing/unknown conversation or rfp, non-chat
 * channel, malformed channel, missing field, bad JSON — returns the SAME
 * generic deny. We never distinguish "not found" from "forbidden": doing so
 * would leak whether a conversation exists, breaking the privacy invariant.
 */
import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getChatConversationRepo,
  getInvitationRepo,
  getPresenceAccessRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  chatChannel,
  PRESENCE_CHANNEL_PREFIX,
  TEAM_CHANNEL_PREFIX,
} from '@/lib/server/realtime/centrifugo';
import { canWorkspaceAccessRfp } from '@/lib/server/rfp-access';

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

// `meta` is attached by Centrifugo from the signed connection JWT. Client
// subscription `data` is deliberately ignored because it is attacker-controlled.
const ProxySchema = z.object({
  user: z.string().min(1),
  channel: z.string().min(1),
  meta: z.object({ workspaceId: z.string().uuid() }),
});

export async function POST(request: Request): Promise<NextResponse> {
  // 공유 비밀이 없으면 거부한다. 설정된 비밀은 길이·값 모두 상수시간으로
  // 비교해 타이밍 오라클 차단: envBuf 길이로 cmpBuf 를 먼저 할당한 뒤 hdBytes 를
  // 복사(초과 분 절사·부족 분 \0 패딩), timingSafeEqual 을 항상 실행한다.
  const envSecret = process.env.CENTRIFUGO_PROXY_SECRET;
  if (!envSecret) return deny();
  {
    const headerVal = request.headers.get('X-Centrifugo-Proxy-Secret') ?? '';
    const envBuf = Buffer.from(envSecret);
    const hdBytes = Buffer.from(headerVal);
    const cmpBuf = Buffer.alloc(envBuf.length, 0);
    hdBytes.copy(cmpBuf); // excess truncated, shortfall zero-padded
    const byteMatch = timingSafeEqual(envBuf, cmpBuf); // always runs
    const lenMatch = hdBytes.length === envBuf.length;
    if (!byteMatch || !lenMatch) return deny();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return deny();
  }

  const parsed = ProxySchema.safeParse(payload);
  if (!parsed.success) return deny();

  const { user, channel, meta } = parsed.data;

  let workspaceRepo: Awaited<ReturnType<typeof getWorkspaceRepo>>;
  try {
    workspaceRepo = await getWorkspaceRepo();
    if (!(await workspaceRepo.hasActiveBusinessMembership(user, meta.workspaceId))) {
      return deny();
    }
  } catch {
    return deny();
  }

  if (channel.startsWith(TEAM_CHANNEL_PREFIX)) {
    return authorizeTeamChannel(meta.workspaceId, channel);
  }

  if (channel.startsWith(PRESENCE_CHANNEL_PREFIX)) {
    return authorizePresenceChannel(meta.workspaceId, channel);
  }

  // Reverse-parse the channel via the single-source convention.
  if (!channel.startsWith(CHANNEL_PREFIX)) return deny();
  const conversationId = channel.slice(CHANNEL_PREFIX.length);

  // Guard against non-uuid ids BEFORE the conversation query —
  // findById('garbage') would throw 22P02 on a uuid column.
  if (!z.string().uuid().safeParse(conversationId).success) return deny();

  try {
    const convRepo = await getChatConversationRepo();
    const conv = await convRepo.findById(conversationId);
    if (!conv) return deny();

    const workspaceMatches =
      meta.workspaceId === conv.buyerWsId || meta.workspaceId === conv.pgWsId;
    return workspaceMatches ? allow() : deny();
  } catch {
    // Any unexpected error → deny (fail closed). Never leak details.
    return deny();
  }
}

// presence:ws:<workspaceId> — 관계 게이트 presence ACL (header doc 참조).
async function authorizePresenceChannel(
  observerWorkspaceId: string,
  channel: string,
): Promise<NextResponse> {
  const workspaceId = channel.slice(PRESENCE_CHANNEL_PREFIX.length);
  // uuid-gate BEFORE the presence relation queries — zod .uuid() 는 전체 문자열 검증이라
  // 꼬리 세그먼트(`<uuid>:extra`)·공백도 여기서 걸러진다.
  if (!z.string().uuid().safeParse(workspaceId).success) return deny();

  try {
    const presenceRepo = await getPresenceAccessRepo();
    const allowed = await presenceRepo.canObserve(observerWorkspaceId, workspaceId);
    return allowed ? allow() : deny();
  } catch {
    // Any unexpected error → deny (fail closed). Never leak details.
    return deny();
  }
}

// team:rfp:<rfpId>:<workspaceId> — RFP 팀 채팅 채널 ACL (header doc 참조).
async function authorizeTeamChannel(
  actorWorkspaceId: string,
  channel: string,
): Promise<NextResponse> {
  const parts = channel.slice(TEAM_CHANNEL_PREFIX.length).split(':');
  if (parts.length !== 2) return deny();
  const [rfpId, workspaceId] = parts;
  // uuid-gate BEFORE the RFP queries, anchored ^…$ — no smuggling.
  if (!z.string().uuid().safeParse(rfpId).success) return deny();
  if (!z.string().uuid().safeParse(workspaceId).success) return deny();
  if (workspaceId !== actorWorkspaceId) return deny();

  try {
    const [rfpRepo, invRepo] = await Promise.all([getRfpRepo(), getInvitationRepo()]);
    const access = await canWorkspaceAccessRfp(rfpRepo, invRepo, rfpId, workspaceId);
    return access.allowed ? allow() : deny();
  } catch {
    // Any unexpected error → deny (fail closed). Never leak details.
    return deny();
  }
}
