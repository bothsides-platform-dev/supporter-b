'use client';

import { MessageCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SidebarFooterControlsProps = {
  className?: string;
};

export function SidebarFooterControls({ className }: SidebarFooterControlsProps) {
  // 위쪽 nav 와 같은 문법: 아이콘 바로 옆에 라벨(gap-2.5), 좌측 정렬, px-2.5 로
  // 아이콘이 nav 아이콘 열에 선다. justify-between 을 쓰면 200px 폭에서 아이콘과
  // 라벨이 양 끝으로 갈라져 사이드바에서 이 행만 문법이 어긋난다.
  const contactButton = (
    <button
      type="button"
      aria-label="문의하기"
      onClick={() => window.ChannelIO?.('showMessenger')}
      className="flex h-8 w-full items-center gap-2.5 rounded-[var(--md-sys-shape-small)] px-2.5 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
    >
      <MessageCircle size={18} aria-hidden="true" className="shrink-0" />
      <span className="text-[length:var(--md-typescale-label-large-size)] group-data-[collapsible=icon]:hidden">
        문의하기
      </span>
    </button>
  );

  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      <Tooltip>
        <TooltipTrigger render={contactButton} />
        <TooltipContent side="right" sideOffset={8}>
          문의하기
        </TooltipContent>
      </Tooltip>

      <div
        data-testid="sidebar-footer-toolbar"
        className={cn(
          // 좌측 정렬 — 위 문의하기 행·nav 아이콘 열과 같은 열에 선다.
          // 접힘 시엔 48px 레일 안에서 중앙 정렬한다.
          // (접기 토글이 헤더로 빠지면서 자식이 ThemeToggle 하나만 남았다 —
          //  flex-row/justify-start/gap/flex-col 은 전부 무효라 걷어냈다.)
          'flex w-full items-center',
          'group-data-[collapsible=icon]:justify-center',
        )}
      >
        <ThemeToggle />
      </div>
    </div>
  );
}
