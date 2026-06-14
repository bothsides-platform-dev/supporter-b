'use client';

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import type { InboxListItem } from './types';

type Props = {
  items: InboxListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
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

export function ConversationList({ items, selectedKey, onSelect }: Props) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const active = item.key === selectedKey;
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSelect(item.key)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full items-start gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-3 text-left transition-colors',
                active
                  ? 'bg-[var(--md-sys-color-surface-container)]'
                  : 'hover:bg-[var(--md-sys-color-surface-container-low)]',
              )}
            >
              {item.kind === 'team' ? (
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-full)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]"
                >
                  <Users size={18} strokeWidth={1.5} />
                </span>
              ) : (
                <WorkspaceAvatar
                  name={item.counterparty.name}
                  size="md"
                  workspaceId={item.counterparty.workspaceId}
                  hasLogo={item.counterparty.hasLogo}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  {item.kind === 'team' ? (
                    <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                      팀 · <span className="md-numeric">{item.rfpCode}</span> {item.rfpTitle}
                    </span>
                  ) : (
                    <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                      {item.counterparty.name}
                    </span>
                  )}
                  {item.lastMessageAt && (
                    <time
                      dateTime={item.lastMessageAt}
                      className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]"
                    >
                      {formatLastMessageTime(item.lastMessageAt)}
                    </time>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                    {item.preview}
                  </p>
                  {item.unread && (
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
