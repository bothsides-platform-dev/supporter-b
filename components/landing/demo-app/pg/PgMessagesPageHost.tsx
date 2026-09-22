'use client';

import { PageEnter } from '@/components/primitives/PageEnter';
import { PageHeader } from '@/components/shell/PageHeader';
import { MessageInbox } from '@/components/messages/MessageInbox';
import { seedThread } from '@/components/messages/thread-cache';
import {
  demoPgConversationId,
  demoPgMessageItems,
  demoPgMessageUnread,
  demoPgThread,
} from './pg-demo-fixtures';

// 데모 메시지 — 실제 /messages 와 같은 구성(PageEnter + PageHeader + MessageInbox)을
// 쓴다. 스레드 페인은 서버 액션으로 메시지를 불러오므로(비로그인 데모에서는 불가)
// 모듈 로드 시점에 스레드 캐시를 고정 대화로 시딩해 같은 컴포넌트를 그대로 채운다.
// 전송은 guest 로 잠근다 — 실제 액션을 태우면 랜딩에서 실패 토스트가 뜬다.
//
// 목록에 상대방 대화만 있는 것은 fixture 선택이다(팀 스레드는 로더가 따로라 채울
// 경로가 없다) — 화면 구성 자체는 실제와 같은 코드에서 나온다.
seedThread(demoPgConversationId, demoPgThread);

export function PgMessagesPageHost() {
  return (
    <PageEnter className="flex h-full min-h-0 flex-col">
      <PageHeader title="메시지" count={demoPgMessageUnread} countKind="unread" />
      <MessageInbox
        items={demoPgMessageItems}
        initialSelectedKey={`c:${demoPgConversationId}`}
        className="min-h-0 flex-1"
        guest
      />
    </PageEnter>
  );
}
