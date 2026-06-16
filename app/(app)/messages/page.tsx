// 메시지함 — /messages
//
// RFP별 비공개 스레드 모델의 메시지함. 인박스 목록은 서버 액션 로더로 실데이터를
// 전달하고, 스레드 메시지는 대화 선택 시 클라이언트에서 loadConversationThread 로
// 로드한다(MessageInbox 내부).
//
// ?c=<conversationId> searchParam: 홈 위젯 행 클릭 시 해당 대화를 자동 선택한다.
import { PageEnter } from '@/components/primitives/PageEnter';
import { PageHeader } from '@/components/shell/PageHeader';
import { MessageInbox } from '@/components/messages/MessageInbox';
import { listConversationsForViewer } from '@/lib/server/actions/chat/conversationLoaders';
import type { InboxListItem } from '@/components/messages/types';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const [conversations, { c: initialConvId }] = await Promise.all([
    listConversationsForViewer(),
    searchParams,
  ]);
  const unread = conversations.filter((conv) => conv.unread).length;

  // Map ConversationListItem → InboxListItem (counterparty kind only for now).
  const items: InboxListItem[] = conversations.map((conv) => ({
    kind: 'counterparty' as const,
    key: `c:${conv.conversationId}`,
    conversationId: conv.conversationId,
    counterparty: conv.counterparty,
    rfpId: conv.rfpId,
    rfpCode: conv.rfpCode,
    rfpTitle: conv.rfpTitle,
    rfpStatus: conv.rfpStatus,
    rfpDeadline: conv.rfpDeadline,
    preview: conv.preview,
    lastMessageAt: conv.lastMessageAt,
    unread: conv.unread,
  }));

  // If ?c= was passed, resolve it to the corresponding item key.
  const initialSelectedKey = initialConvId
    ? (items.find((i) => i.kind === 'counterparty' && i.conversationId === initialConvId)?.key ?? null)
    : null;

  return (
    <PageEnter className="flex h-full flex-col">
      <PageHeader title="메시지" count={unread} />
      <MessageInbox items={items} initialSelectedKey={initialSelectedKey} className="min-h-0 flex-1" />
    </PageEnter>
  );
}
