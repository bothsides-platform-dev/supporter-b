'use client';

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarWithPresence } from '@/components/presence/AvatarWithPresence';
import { UNREAD_LABEL } from '@/lib/types/notification';
import { formatListTime } from './format';
import type { InboxListItem } from './types';

type Props = {
  items: InboxListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export function ConversationList({ items, selectedKey, onSelect }: Props) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const active = item.key === selectedKey;
        const name = item.kind === 'team' ? '팀 채팅' : item.counterparty.name;
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSelect(item.key)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full items-start gap-2.5 border-b border-l-2 border-b-[var(--md-sys-color-outline-variant)] px-3 py-3 text-left transition-colors',
                active
                  ? 'border-l-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container)]'
                  : 'border-l-transparent hover:bg-[var(--md-sys-color-surface-container-low)]',
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
                <AvatarWithPresence
                  name={item.counterparty.name}
                  workspaceId={item.counterparty.workspaceId}
                  logoUpdatedAt={item.counterparty.logoUpdatedAt}
                  size="md"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'truncate text-[13px] text-[var(--md-sys-color-on-surface)]',
                      item.unread ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {name}
                  </span>
                  {item.lastMessageAt && (
                    <time
                      dateTime={item.lastMessageAt}
                      className="md-numeric shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]"
                    >
                      {formatListTime(item.lastMessageAt)}
                    </time>
                  )}
                </div>
                {/* RFP 줄 — counterparty·team 공통(코드 · 제목) */}
                {item.rfpCode && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    <span className="md-numeric shrink-0 font-medium text-[var(--md-sys-color-primary)]">
                      {item.rfpCode}
                    </span>
                    <span className="truncate"><span aria-hidden>·</span> {item.rfpTitle}</span>
                  </div>
                )}
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p
                    className={cn(
                      'min-w-0 flex-1 truncate text-[12px]',
                      item.unread
                        ? 'text-[var(--md-sys-color-on-surface)]'
                        : 'text-[var(--md-sys-color-on-surface-variant)]',
                    )}
                  >
                    {item.preview}
                  </p>
                  {item.unread && <span className="sr-only">{UNREAD_LABEL}</span>}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
