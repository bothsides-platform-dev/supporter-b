'use client';

import { cn } from '@/lib/utils';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import type { ConversationListItem } from './types';

type Props = {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// 마지막 메시지 시각 — Asia/Seoul 절대시각(예 "오전 10:00"). 러너 TZ에 흔들리지
// 않도록 timeZone 을 고정해요(상대시각은 Date.now() 의존 → 테스트 플레이키).
function formatLastMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function ConversationList({ conversations, selectedId, onSelect }: Props) {
  return (
    <ul className="flex flex-col">
      {conversations.map((c) => {
        const active = c.conversationId === selectedId;
        return (
          <li key={c.conversationId}>
            <button
              type="button"
              onClick={() => onSelect(c.conversationId)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full items-start gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-3 text-left transition-colors',
                active
                  ? 'bg-[var(--md-sys-color-surface-container)]'
                  : 'hover:bg-[var(--md-sys-color-surface-container-low)]',
              )}
            >
              <WorkspaceAvatar
                name={c.counterparty.name}
                size="md"
                workspaceId={c.counterparty.workspaceId}
                hasLogo={c.counterparty.hasLogo}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                    {c.counterparty.name}
                  </span>
                  {c.lastMessageAt && (
                    <time
                      dateTime={c.lastMessageAt}
                      className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]"
                    >
                      {formatLastMessageTime(c.lastMessageAt)}
                    </time>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                    {c.preview}
                  </p>
                  {c.unread && (
                    <span
                      aria-label="읽지 않음"
                      className="size-2 shrink-0 rounded-full bg-[var(--md-sys-color-primary)]"
                    />
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
