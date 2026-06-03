// 메시지함 — /messages
//
// RFP별 비공개 스레드 모델의 메시지함. 인박스 목록은 서버 액션 로더로 실데이터를
// 전달하고, 스레드 메시지는 대화 선택 시 클라이언트에서 loadConversationThread 로
// 로드한다(MessageInbox 내부).
import { PageEnter } from '@/components/primitives/PageEnter';
import { PageHeader } from '@/components/shell/PageHeader';
import { MessageInbox } from '@/components/messages/MessageInbox';
import { listConversationsForViewer } from '@/lib/server/actions/chat/conversationLoaders';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const conversations = await listConversationsForViewer();
  const unread = conversations.filter((c) => c.unread).length;

  return (
    <PageEnter className="flex h-full flex-col">
      <PageHeader title="메시지" count={unread} />
      <MessageInbox conversations={conversations} />
    </PageEnter>
  );
}
