'use client';

import { useState } from 'react';
import { SplitView } from '@/components/ui/split-view';
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';
import { ConversationList } from './ConversationList';
import { ThreadView } from './ThreadView';
import type { MockConversation } from './mock-data';

type Props = { conversations: MockConversation[] };

export function MessageInbox({ conversations }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <SplitView
      list={
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      }
      panel={
        selected ? (
          <ThreadView conversation={selected} />
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
