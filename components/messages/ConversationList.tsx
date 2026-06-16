'use client';

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
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
                      {formatListTime(item.lastMessageAt)}
                    </time>
                  )}
                </div>
                {/* RFP chip — counterparty 항목에서 연결 견적 표시 */}
                {item.kind === 'counterparty' && item.rfpCode && (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="md-numeric shrink-0 rounded-[3px] bg-[var(--md-sys-color-primary-container)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--md-sys-color-on-primary-container)]">
                      {item.rfpCode}
                    </span>
                    <span className="truncate text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {item.rfpTitle}
                    </span>
                  </div>
                )}
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
