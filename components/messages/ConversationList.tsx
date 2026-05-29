'use client';

import { cn } from '@/lib/utils';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import type { MockConversation } from './mock-data';

type Props = {
  conversations: MockConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ConversationList({ conversations, selectedId, onSelect }: Props) {
  return (
    <ul className="flex flex-col">
      {conversations.map((c) => {
        const active = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
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
                  <span className="shrink-0 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    {c.time}
                  </span>
                </div>
                <p className="truncate font-mono text-[10px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                  {c.rfp.code}
                </p>
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
