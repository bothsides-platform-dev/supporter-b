'use server';
import { getTeamChatService } from '@/lib/server/services/team-chat';
import { listConversationsForViewer, type ConversationListItem } from './conversationLoaders';
import { requireActiveWorkspace } from './_shared';

export type InboxListItem =
  | ({ kind: 'counterparty'; key: string } & ConversationListItem)
  | { kind: 'team'; key: string; rfpId: string; rfpCode: string; rfpTitle: string; preview: string; lastMessageAt: string | null; unread: boolean };

/** 세션 워크스페이스의 팀 스레드 목록(통합 인박스 'team' 항목). */
export async function listTeamThreadsForViewer(): Promise<Extract<InboxListItem, { kind: 'team' }>[]> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return [];
  const service = await getTeamChatService();
  const r = await service.listThreads({ userId: ws.userId, workspaceId: ws.workspaceId, workspaceType: ws.workspaceType });
  if (!r.ok) return [];
  return r.threads.map((t) => ({
    kind: 'team' as const,
    key: `t:${t.rfpId}`,
    rfpId: t.rfpId,
    rfpCode: t.rfpCode,
    rfpTitle: t.rfpTitle,
    preview: t.preview,
    lastMessageAt: t.lastMessageAt,
    unread: t.unread,
  }));
}

/** 상대방 대화 + 팀 스레드 통합 목록 — lastMessageAt desc(null 후순위). */
export async function listInboxForViewer(): Promise<InboxListItem[]> {
  const [conversations, teamThreads] = await Promise.all([
    listConversationsForViewer(),
    listTeamThreadsForViewer(),
  ]);
  const counterparty: InboxListItem[] = conversations.map((c) => ({
    kind: 'counterparty' as const, key: `c:${c.conversationId}`, ...c,
  }));
  const all = [...counterparty, ...teamThreads];
  all.sort((a, b) => {
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : -Infinity;
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : -Infinity;
    return tb - ta;
  });
  return all;
}
