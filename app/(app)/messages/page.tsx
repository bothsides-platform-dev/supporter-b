// 메시지함 — /messages
//
// RFP별 비공개 스레드 모델의 메시지함(렌더 전용). 백엔드 미구현이라 대화/메시지는 목 데이터이며,
// 모든 전송 액션('보내기'/'채팅보내기')은 '구현중' 모달로 귀결한다.
import { requireSession } from '@/lib/auth/session';
import { PageEnter } from '@/components/primitives/PageEnter';
import { PageHeader } from '@/components/shell/PageHeader';
import { MessageInbox } from '@/components/messages/MessageInbox';
import { getMockConversations } from '@/components/messages/mock-data';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const session = await requireSession();
  const conversations = getMockConversations(session.user.workspaceType ?? 'buyer');
  const unread = conversations.filter((c) => c.unread).length;

  return (
    <PageEnter className="flex h-full flex-col">
      <PageHeader title="메시지" count={unread} />
      <MessageInbox conversations={conversations} />
    </PageEnter>
  );
}
