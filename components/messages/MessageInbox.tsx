'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';
import { loadConversationThread } from '@/lib/server/actions/chat/conversationLoaders';
import { ConversationList } from './ConversationList';
import { NewConversationSheet } from './NewConversationSheet';
import { ThreadView } from './ThreadView';
import type { ConversationListItem, ThreadMessage } from './types';

type Props = { conversations: ConversationListItem[] };

type LoadedThread = {
  counterparty: { workspaceId: string; name: string; type: 'buyer' | 'pg' };
  messages: ThreadMessage[];
};

export function MessageInbox({ conversations }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<LoadedThread | null>(null);
  const selected = conversations.find((c) => c.conversationId === selectedId) ?? null;

  async function handleSelect(id: string) {
    setSelectedId(id);
    setThread(null);
    const result = await loadConversationThread(id);
    if (result.ok) {
      setThread({ counterparty: result.counterparty, messages: result.messages });
    }
  }

  // 메신저형 2-컬럼: 좌측 고정폭 대화 목록 + 우측 스레드. (RFP peek 오버레이형
  // SplitView 대신 — 오버레이는 목록을 240px로 잘라 시각·미리보기·버튼이 클립됨.)
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-80 shrink-0 flex-col border-r border-[var(--md-sys-color-outline-variant)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2.5">
          <span className="text-[12px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            대화
          </span>
          <NewConversationSheet />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          // Key by conversationId so switching conversations remounts the
          // thread — resets local message/read state and re-fires mark-read &
          // the live subscription for the newly opened conversation.
          <ThreadView
            key={selected.conversationId}
            conversationId={selected.conversationId}
            counterparty={thread?.counterparty ?? selected.counterparty}
            messages={thread?.messages ?? []}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<EnvelopeIcon />}
              title="대화를 선택하세요"
              description="좌측 목록에서 대화를 열어 메시지를 확인하세요."
            />
          </div>
        )}
      </div>
    </div>
  );
}
