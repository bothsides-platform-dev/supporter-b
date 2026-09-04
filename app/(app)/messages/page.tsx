// 메시지함 — /messages
//
// 통합 인박스: 상대방 비공개 스레드 + 팀 스레드를 한 목록에 합쳐 전달한다.
// 목록은 서버 액션 로더(listInboxForViewer)로 실데이터를 전달하고, 각 스레드
// 메시지는 항목 선택 시 클라이언트에서 로드한다(MessageInbox 내부).
//
// 딥링크 searchParam(상호배타, 동시엔 c 우선):
//   ?c=<conversationId> — 상대방 대화 자동 선택(홈 위젯·레일 "메시지함에서 열기").
//   ?t=<rfpId>          — 팀 스레드 자동 선택.
import { PageEnter } from '@/components/primitives/PageEnter';
import { PageHeader } from '@/components/shell/PageHeader';
import { MessageInbox } from '@/components/messages/MessageInbox';
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; t?: string }>;
}) {
  const [items, { c, t }] = await Promise.all([listInboxForViewer(), searchParams]);
  const unread = items.filter((i) => i.unread).length;
  // c·t 상호배타, 동시 지정 시 c(상대방 대화) 우선.
  const initialSelectedKey = c ? `c:${c}` : t ? `t:${t}` : null;

  return (
    <PageEnter className="flex h-full flex-col">
      {/* count 는 목록 길이가 아니라 안 읽은 수다 — /notifications 와 같은 톤 규칙을 쓴다. */}
      <PageHeader title="메시지" count={unread} countKind="unread" />
      <MessageInbox items={items} initialSelectedKey={initialSelectedKey} className="min-h-0 flex-1" />
    </PageEnter>
  );
}
