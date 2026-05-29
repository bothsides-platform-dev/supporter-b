'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/primitives/Chip';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { PaperclipIcon, ChevronRightIcon } from '@/components/icons';
import { ComingSoonDialog } from './ComingSoonDialog';
import { COUNTERPARTY_TYPE_LABEL, type Counterparty } from './types';
import type { MockConversation } from './mock-data';

type Props = { conversation: MockConversation };

// 상대가 구매사면 현재 사용자는 PG(받은 RFP), 상대가 PG면 현재 사용자는 구매사(RFP).
function rfpHref(counterparty: Counterparty, code: string): string {
  return counterparty.type === 'buyer' ? `/inbox/${code}` : `/rfp/${code}`;
}

export function ThreadView({ conversation }: Props) {
  const [draft, setDraft] = useState('');
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const { counterparty, rfp, messages } = conversation;

  return (
    <div className="flex h-full flex-col">
      {/* 헤더 — 상대 + RFP 링크 */}
      <header className="flex items-center gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <WorkspaceAvatar
          name={counterparty.name}
          size="md"
          workspaceId={counterparty.workspaceId}
          hasLogo={counterparty.hasLogo}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
              {counterparty.name}
            </span>
            <Chip label={COUNTERPARTY_TYPE_LABEL[counterparty.type]} color="surface" />
          </div>
          <Link
            href={rfpHref(counterparty, rfp.code)}
            className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)]"
          >
            <span className="font-mono tabular-nums">{rfp.code}</span>
            <span className="truncate">· {rfp.title}</span>
            <ChevronRightIcon size={14} />
          </Link>
        </div>
      </header>

      {/* 말풍선 목록 */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          const isSelf = m.sender === 'self';
          return (
            <div key={m.id} className={cn('flex flex-col gap-1', isSelf ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[78%] rounded-[var(--md-sys-shape-medium)] px-3 py-2 text-[13px] leading-relaxed',
                  isSelf
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]',
                )}
              >
                {m.body}
              </div>
              <span className="px-1 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{m.time}</span>
            </div>
          );
        })}
      </div>

      {/* 컴포저 — 보내기 → 구현중 모달 */}
      <div className="flex items-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="파일 첨부"
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] opacity-60"
        >
          <PaperclipIcon size={16} />
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="메시지 입력…"
          rows={1}
          className="flex-1 resize-none rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
        />
        <Button size="sm" onClick={() => setComingSoonOpen(true)}>
          보내기
        </Button>
      </div>

      <ComingSoonDialog open={comingSoonOpen} onOpenChange={setComingSoonOpen} />
    </div>
  );
}
