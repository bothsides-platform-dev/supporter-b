'use client';

/**
 * ChatRailToggle — 상세 화면 헤더의 채팅 레일 토글.
 *
 * lg+ : 우측 채팅 레일(ChatRail)을 여닫는다 (aria-pressed).
 * lg 미만 : 레일을 둘 폭이 없으므로 상대와의 대화를 해소해 /messages?c=<id> 로
 *           이동하는 폴백 버튼을 노출한다 (상대 없으면 비활성).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { EnvelopeIcon } from '@/components/icons';
import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';
import { useChatRailStore } from '@/lib/stores/chat-rail';
import { toast } from '@/lib/toast';

const BUTTON_CLASS = [
  'h-7 items-center gap-1.5 rounded-[var(--md-sys-shape-small)] border px-2.5 text-[12px] transition-colors',
  'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]',
  'hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
  'disabled:opacity-50 disabled:hover:bg-transparent',
].join(' ');

export function ChatRailToggle({ className }: { className?: string }) {
  const open = useChatRailStore((s) => s.open);
  const setOpen = useChatRailStore((s) => s.setOpen);
  const counterparty = useChatRailStore((s) => s.counterparty);
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  async function goToMessages(): Promise<void> {
    if (!counterparty || navigating) return;
    setNavigating(true);
    try {
      const r = await getOrCreateConversationAction(counterparty.workspaceId);
      if (r.ok) {
        router.push(`/messages?c=${r.conversationId}`);
        return;
      }
    } catch {
      // fall through to the toast below
    }
    setNavigating(false);
    toast('대화를 열지 못했어요. 다시 시도해 주세요.', { type: 'error' });
  }

  return (
    <>
      {/* lg+ — 레일 토글 */}
      <button
        type="button"
        aria-pressed={open}
        onClick={() => setOpen(!open)}
        className={cn(
          'hidden lg:inline-flex',
          BUTTON_CLASS,
          open &&
            'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]',
          className,
        )}
      >
        <EnvelopeIcon size={14} />
        메시지
      </button>
      {/* lg 미만 — /messages 폴백 */}
      <button
        type="button"
        disabled={!counterparty || navigating}
        onClick={() => void goToMessages()}
        className={cn('inline-flex lg:hidden', BUTTON_CLASS, className)}
      >
        <EnvelopeIcon size={14} />
        메시지함에서 보기
      </button>
    </>
  );
}
