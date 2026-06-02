'use server';

import {
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import type { WorkspaceType } from '@/lib/types/workspace';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

export type ConversationListItem = {
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: WorkspaceType; hasLogo: boolean };
  rfpId: string | null;
  preview: string;
  lastMessageAt: string | null;
  unread: boolean;
};

export type ThreadMessage = {
  id: string;
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
};

export type LoadThreadResult = ChatActionResult<{
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: WorkspaceType };
  messages: ThreadMessage[];
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

  const conversations = await convRepo.listForWorkspace(ws.workspaceId, ws.workspaceType);

  const items: ConversationListItem[] = [];
  for (const conv of conversations) {
    const counterpartyWsId =
      ws.workspaceType === 'buyer' ? conv.pgWsId : conv.buyerWsId;
    const counterpartyType: WorkspaceType =
      ws.workspaceType === 'buyer' ? 'pg' : 'buyer';
    const counterpartyWs = await wsRepo.findById(counterpartyWsId);

    const msgs = await msgRepo.listByConversation(conv.id);
    const last = msgs[msgs.length - 1];

    const myRead = await readRepo.getFor(conv.id, ws.userId);
    const lastReadAt = myRead?.lastReadAt ?? null;
    // Unread if there's a message after my last read AND it isn't my own.
    const unread =
      !!last &&
      last.authorWsId !== ws.workspaceId &&
      (lastReadAt === null || new Date(last.createdAt) > new Date(lastReadAt));

    items.push({
      conversationId: conv.id,
      counterparty: {
        workspaceId: counterpartyWsId,
        name: counterpartyWs?.name ?? '상대',
        type: counterpartyType,
        hasLogo: counterpartyWs?.hasLogo ?? false,
      },
      rfpId: last?.rfpId ?? null,
      preview: last?.body ?? '',
      lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
      unread,
    });
  }
  return items;
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
  const counterpartyMemberIds = await wsRepo.memberUserIds(counterpartyWsId);
  let counterpartyReadAt: Date | null = null;
  for (const userId of counterpartyMemberIds) {
    const read = await readRepo.getFor(conversationId, userId);
    if (read?.lastReadAt) {
      const at = new Date(read.lastReadAt);
      if (counterpartyReadAt === null || at > counterpartyReadAt) {
        counterpartyReadAt = at;
      }
    }
  }

  const msgRepo = await getChatMessageRepo();
  const rows = await msgRepo.listByConversation(conversationId);
  const messages: ThreadMessage[] = rows.map((m) => {
    const isSelf = m.authorWsId === ws.workspaceId;
    return {
      id: m.id,
      sender: isSelf ? 'self' : 'other',
      body: m.body,
      rfpId: m.rfpId,
      createdAt: new Date(m.createdAt).toISOString(),
      readByCounterparty:
        isSelf &&
        counterpartyReadAt !== null &&
        counterpartyReadAt >= new Date(m.createdAt),
    };
  });

  return {
    ok: true,
    conversationId,
    counterparty: {
      workspaceId: counterpartyWsId,
      name: counterpartyWs?.name ?? '상대',
      type: counterpartyType,
    },
    messages,
  };
}
