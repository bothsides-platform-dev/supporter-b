'use client';

import { useState } from 'react';
import { SplitView } from '@/components/ui/split-view';
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

  return (
    <SplitView
      list={
        <div className="flex h-full flex-col">
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
      }
      panel={
        selected ? (
          <ThreadView
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
        )
      }
    />
  );
}
