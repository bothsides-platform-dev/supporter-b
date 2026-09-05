'use server';

import {
  getAttachmentRepo,
  getBidRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
  getRfpRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { isConversationClosedAfterAward } from '@/lib/rfp/closed-counterparties';
import type { Attachment } from '@/lib/types/common';
import type { WorkspaceType } from '@/lib/types/workspace';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

export type ConversationListItem = {
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: WorkspaceType; logoUpdatedAt: string | null };
  rfpId: string | null;
  rfpCode: string | null;
  rfpTitle: string | null;
  rfpStatus: string | null;
  rfpDeadline: string | null;
  preview: string;
  lastMessageAt: string | null;
  unread: boolean;
  /**
   * 이 대화의 (마지막 메시지) RFP 가 선정 종료됐고 이 대화의 PG 측이 미선정이면 true.
   * /messages 통합 인박스에서 입력창을 닫는 UI 신호 — 승자 신원은 직렬화하지 않는다
   * (봉인 입찰 보존). 딜룸의 closedCounterpartyIds 와 같은 규칙(awarded 한정).
   */
  closedAfterAward: boolean;
};

export type ThreadMessage = {
  id: string;
  /** 작성자 user id — 작성자별 그룹핑·낙관적 self 판별의 단일 키. */
  authorUserId: string;
  /** 작성자 표시 이름(users.name 조인) — 말풍선 그룹 헤더. */
  authorName: string;
  /** 작성자 이메일(users.email 조인) — 이름 호버로 노출. */
  authorEmail: string;
  /** 작성자 프로필 사진 버전(users.avatar_updated_at, ISO) — 말풍선 아바타. */
  authorAvatarUpdatedAt: string | null;
  sender: 'self' | 'other';
  body: string;
  rfpId: string | null;
  createdAt: string;
  /**
   * Read receipt for a `self` message: true when a member of the counterparty
   * workspace has a last_read_at >= this message's createdAt (i.e. the other
   * side has read it). Always false for `other` messages — the viewer's own
   * read does not count.
   */
  readByCounterparty: boolean;
  attachments: Attachment[];
};

export type LoadThreadResult = ChatActionResult<{
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: WorkspaceType; logoUpdatedAt: string | null };
  /** 세션 사용자(클라이언트는 세션을 모른다) — 낙관적 self 말풍선이 즉시 자기
   *  이름을 그릴 때 쓴다. */
  viewer: { userId: string; name: string; avatarUpdatedAt: string | null };
  messages: ThreadMessage[];
  /** 스레드에 등장한 rfpId → { code, title } 맵. 메시지 RFP 칩 렌더용. */
  rfpById: Record<string, { code: string; title: string }>;
}>;

/**
 * Inbox loader — the session workspace's conversations, filtered to its own
 * side (buyer viewer sees buyer_ws_id=me; pg viewer sees pg_ws_id=me), sorted
 * last_message_at desc, each hydrated with the counterparty + unread flag.
 */
export async function listConversationsForViewer(): Promise<ConversationListItem[]> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return [];

  const convRepo = await getChatConversationRepo();
  const msgRepo = await getChatMessageRepo();
  const readRepo = await getChatReadRepo();
  const wsRepo = await getWorkspaceRepo();
  const rfpRepo = await getRfpRepo();
  const bidRepo = await getBidRepo();

  const conversations = await convRepo.listForWorkspace(ws.workspaceId, ws.workspaceType);
  if (conversations.length === 0) return [];

  const counterpartyType: WorkspaceType = ws.workspaceType === 'buyer' ? 'pg' : 'buyer';
  const counterpartyWsIdOf = (conv: { buyerWsId: string; pgWsId: string }) =>
    ws.workspaceType === 'buyer' ? conv.pgWsId : conv.buyerWsId;

  const convIds = conversations.map((c) => c.id);

  // 아래는 전부 **대화 개수와 무관하게 고정 횟수**다. 예전 구현은 대화마다
  // 상대 워크스페이스·전체 메시지 이력·읽음·RFP 를 각각 조회해 1+4N 이었고,
  // 특히 마지막 1건만 쓰면서 이력을 통째로 받아 메시지 수에도 비례했다.
  const [lastMessages, myReads] = await Promise.all([
    msgRepo.lastByConversations(convIds),
    readRepo.getForMany(convIds, ws.workspaceId, ws.userId),
  ]);
  const lastByConv = new Map(lastMessages.map((m) => [m.conversationId, m]));
  const readByConv = new Map(myReads.map((r) => [r.conversationId, r]));

  // RFP 는 각 대화의 **마지막 메시지**가 가리키는 것만 필요하므로 위 결과에
  // 의존한다 — 그래서 이 배치는 앞 배치와 병렬이 아니라 그 뒤에 온다.
  const rfpIds = Array.from(
    new Set(lastMessages.map((m) => m.rfpId).filter((id): id is string => Boolean(id))),
  );
  const counterpartyWsIds = Array.from(new Set(conversations.map(counterpartyWsIdOf)));
  const [counterpartyWorkspaces, rfps] = await Promise.all([
    wsRepo.findDisplayInfoByIds(counterpartyWsIds),
    rfpRepo.findByIds(rfpIds),
  ]);
  const wsById = new Map(counterpartyWorkspaces.map((w) => [w.id, w]));
  const rfpById = new Map(rfps.map((r) => [r.id, r]));

  // 선정 종료 닫힘 판정용 승자 조회. 예전에는 awardedBidId 단위 메모이제이션
  // (winnerCache)이었는데, 그건 *같은* bid 의 중복만 지울 뿐 서로 다른 선정 RFP
  // 를 가리키는 대화가 N 개면 여전히 N 회 조회였다. 승자 신원은 서버에만 머물고
  // 클라이언트로는 boolean closedAfterAward 만 나간다.
  const awardedBidIds = Array.from(
    new Set(
      rfps
        .filter((r) => r.status === 'awarded' && r.awardedBidId)
        .map((r) => r.awardedBidId as string),
    ),
  );
  const winnerPgWsIdByBidId = new Map(
    (await bidRepo.findPgWsIdsByIds(awardedBidIds)).map((b) => [b.id, b.pgWsId]),
  );

  return conversations.map((conv) => {
    const counterpartyWsId = counterpartyWsIdOf(conv);
    const counterpartyWs = wsById.get(counterpartyWsId);
    const last = lastByConv.get(conv.id);
    const rfpId = last?.rfpId ?? null;
    const rfp = rfpId ? rfpById.get(rfpId) : undefined;

    let closedAfterAward = false;
    if (rfp?.status === 'awarded' && rfp.awardedBidId) {
      const pgSideWsId = ws.workspaceType === 'buyer' ? counterpartyWsId : ws.workspaceId;
      closedAfterAward = isConversationClosedAfterAward({
        rfpStatus: rfp.status,
        awardedBidId: rfp.awardedBidId,
        winnerPgWsId: winnerPgWsIdByBidId.get(rfp.awardedBidId) ?? null,
        pgSideWsId,
      });
    }

    const lastReadAt = last ? (readByConv.get(conv.id)?.lastReadAt ?? null) : null;
    // Unread if there's a message after my last read AND it isn't my own.
    const unread =
      !!last &&
      last.authorWsId !== ws.workspaceId &&
      (lastReadAt === null || new Date(last.createdAt) > new Date(lastReadAt));

    return {
      conversationId: conv.id,
      counterparty: {
        workspaceId: counterpartyWsId,
        name: counterpartyWs?.name ?? '상대',
        type: counterpartyType,
        logoUpdatedAt: counterpartyWs?.logoUpdatedAt ?? null,
      },
      rfpId,
      rfpCode: rfp?.code ?? null,
      rfpTitle: rfp?.title ?? null,
      rfpStatus: rfp?.status ?? null,
      rfpDeadline: rfp?.deadline ? new Date(rfp.deadline).toISOString() : null,
      preview: last?.body ?? '',
      lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
      unread,
      closedAfterAward,
    } satisfies ConversationListItem;
  });
}

/**
 * Thread loader — messages asc for one conversation. FORBIDDEN unless the
 * session workspace owns its side. `sender` is derived from author_ws_id.
 */
export async function loadConversationThread(
  conversationId: string,
): Promise<LoadThreadResult> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const convRepo = await getChatConversationRepo();
  const conv = await convRepo.findById(conversationId);
  if (!conv) return { ok: false, error: 'CONVERSATION_NOT_FOUND' };
  const myWsId = ws.workspaceType === 'buyer' ? conv.buyerWsId : conv.pgWsId;
  if (myWsId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };

  const counterpartyWsId = ws.workspaceType === 'buyer' ? conv.pgWsId : conv.buyerWsId;
  const counterpartyType: WorkspaceType = ws.workspaceType === 'buyer' ? 'pg' : 'buyer';
  const wsRepo = await getWorkspaceRepo();
  const counterpartyWs = await wsRepo.findById(counterpartyWsId);

  // Read receipt: the latest last_read_at across the COUNTERPARTY workspace's
  // members. Constant over the thread, so resolve it once. A co-member of the
  // viewer's own workspace reading must NOT count — hence membership-scoped,
  // not "anyone but me".
  const readRepo = await getChatReadRepo();
  const counterpartyReadAt =
    (await readRepo.maxLastReadAt(conversationId, counterpartyWsId)) ?? null;

  const msgRepo = await getChatMessageRepo();
  const rows = await msgRepo.listByConversationWithAuthor(conversationId);

  // Load attachments for all messages in one query (N+1 없음).
  const attRepo = await getAttachmentRepo();
  const allAttachments = await attRepo.findByChatMessageIds(rows.map((r) => r.id));
  const attachmentsByMsgId = new Map<string, Attachment[]>();
  for (const { chatMessageId, ...att } of allAttachments) {
    const list = attachmentsByMsgId.get(chatMessageId) ?? [];
    list.push(att);
    attachmentsByMsgId.set(chatMessageId, list);
  }

  const messages: ThreadMessage[] = rows.map((m) => {
    const isSelf = m.authorWsId === ws.workspaceId;
    return {
      id: m.id,
      authorUserId: m.authorUserId,
      authorName: m.authorName,
      authorEmail: m.authorEmail,
      authorAvatarUpdatedAt: m.authorAvatarUpdatedAt
        ? new Date(m.authorAvatarUpdatedAt).toISOString()
        : null,
      sender: isSelf ? 'self' : 'other',
      body: m.body,
      rfpId: m.rfpId,
      createdAt: new Date(m.createdAt).toISOString(),
      readByCounterparty:
        isSelf &&
        counterpartyReadAt !== null &&
        counterpartyReadAt >= new Date(m.createdAt),
      attachments: attachmentsByMsgId.get(m.id) ?? [],
    };
  });

  const userRepo = await getUserRepo();
  const viewerUser = await userRepo.findById(ws.userId);

  const rfpRepo = await getRfpRepo();
  const distinctRfpIds = [...new Set(messages.map((m) => m.rfpId).filter((x): x is string => !!x))];
  // findById is two queries each (row join + allowlist), so a thread touching
  // several RFPs paid 2 per id. findByIds pays 2 flat.
  const rfpRows = await rfpRepo.findByIds(distinctRfpIds);
  const rfpById: Record<string, { code: string; title: string }> = {};
  rfpRows.forEach((rfp) => { rfpById[rfp.id] = { code: rfp.code, title: rfp.title }; });

  return {
    ok: true,
    conversationId,
    counterparty: {
      workspaceId: counterpartyWsId,
      name: counterpartyWs?.name ?? '상대',
      type: counterpartyType,
      logoUpdatedAt: counterpartyWs?.logoUpdatedAt ?? null,
    },
    viewer: { userId: ws.userId, name: viewerUser?.name ?? '', avatarUpdatedAt: viewerUser?.avatarUpdatedAt ?? null },
    messages,
    rfpById,
  };
}
