'use client';

import { Suspense, useState } from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';
import { ConversationList } from './ConversationList';
import { NewConversationSheet } from './NewConversationSheet';
import { ThreadPane } from './ThreadPane';
import { ThreadSkeleton } from './ThreadSkeleton';
import type { InboxListItem } from './types';

type Props = {
  items: InboxListItem[];
  /** Pre-select a conversation on mount (e.g. from ?c= deep-link). Ignored if key not in list. */
  initialSelectedKey?: string | null;
  className?: string;
};

export function MessageInbox({ items, initialSelectedKey = null, className }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(initialSelectedKey);
  const [search, setSearch] = useState('');

  const visible = items
    .filter((i) => {
      if (!search) return true;
      const q = search.toLowerCase();
      if (i.kind === 'team') {
        return (
          i.rfpCode.toLowerCase().includes(q) ||
          i.rfpTitle.toLowerCase().includes(q) ||
          i.preview.toLowerCase().includes(q)
        );
      }
      return (
        i.counterparty.name.toLowerCase().includes(q) ||
        (i.rfpCode?.toLowerCase() ?? '').includes(q) ||
        i.preview.toLowerCase().includes(q)
      );
    });

  const selectedItem =
    selectedKey != null ? items.find((i) => i.key === selectedKey) ?? null : null;
  // Only counterparty items have a thread
  const selectedConversationId =
    selectedItem?.kind === 'counterparty' ? selectedItem.conversationId : null;
  const selectedCounterparty =
    selectedItem?.kind === 'counterparty' ? selectedItem.counterparty : null;

  // 메신저형 레이아웃: 데스크톱은 2-컬럼(목록 + 스레드), 모바일은 단일 컬럼으로
  // 목록 ↔ 스레드를 전환한다(선택 시 스레드 전체폭, 뒤로가기로 목록 복귀). 좁은
  // 화면에서 고정 w-80 목록이 스레드를 으스러뜨리던 문제를 해소.
  return (
    <div className={cn('flex min-h-0 flex-1', className)}>
      <div
        data-pane="list"
        className={cn(
          'w-full shrink-0 flex-col border-r border-[var(--md-sys-color-outline-variant)] md:w-80 md:flex',
          selectedConversationId ? 'hidden' : 'flex',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2.5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="대화 검색"
            aria-label="대화 검색"
            className="flex-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2.5 py-1 text-[12px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
          />
          <NewConversationSheet />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList
            items={visible}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>
      </div>
      <div
        data-pane="thread"
        className={cn('flex min-h-0 min-w-0 flex-1 flex-col md:flex', selectedConversationId ? 'flex' : 'hidden')}
      >
        {selectedConversationId && selectedCounterparty ? (
          // key={selectedKey} resets the Suspense boundary when conversation changes,
          // showing the skeleton again for the newly selected conversation.
          <Suspense key={selectedKey} fallback={<ThreadSkeleton />}>
            <ThreadPane
              conversationId={selectedConversationId}
              counterpartyFallback={selectedCounterparty}
              onBack={() => setSelectedKey(null)}
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
