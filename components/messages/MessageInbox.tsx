'use client';

import { Suspense, useState } from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';
import { ConversationList } from './ConversationList';
import { NewConversationSheet } from './NewConversationSheet';
import { ThreadPane } from './ThreadPane';
import { ThreadSkeleton } from './ThreadSkeleton';
import type { ConversationListItem } from './types';

type Props = { conversations: ConversationListItem[] };

export function MessageInbox({ conversations }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversations.find((c) => c.conversationId === selectedId) ?? null;

  // 메신저형 레이아웃: 데스크톱은 2-컬럼(목록 + 스레드), 모바일은 단일 컬럼으로
  // 목록 ↔ 스레드를 전환한다(선택 시 스레드 전체폭, 뒤로가기로 목록 복귀). 좁은
  // 화면에서 고정 w-80 목록이 스레드를 으스러뜨리던 문제를 해소.
  return (
    <div className="flex h-full min-h-0">
      <div
        data-pane="list"
        className={cn(
          'w-full shrink-0 flex-col border-r border-[var(--md-sys-color-outline-variant)] md:w-80 md:flex',
          selected ? 'hidden' : 'flex',
        )}
      >
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
            onSelect={setSelectedId}
          />
        </div>
      </div>
      <div
        data-pane="thread"
        className={cn('min-w-0 flex-1 flex-col md:flex', selected ? 'flex' : 'hidden')}
      >
        {selected ? (
          // key={selectedId} resets the Suspense boundary when conversation changes,
          // showing the skeleton again for the newly selected conversation.
          <Suspense key={selectedId} fallback={<ThreadSkeleton />}>
            <ThreadPane
              conversationId={selected.conversationId}
              counterpartyFallback={selected.counterparty}
              onBack={() => setSelectedId(null)}
            />
          </Suspense>
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
