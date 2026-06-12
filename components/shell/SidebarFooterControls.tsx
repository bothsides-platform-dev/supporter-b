'use client';

import { MessageCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SidebarFooterControlsProps = {
  className?: string;
};

export function SidebarFooterControls({ className }: SidebarFooterControlsProps) {
  const contactButton = (
    <button
      type="button"
      aria-label="문의하기"
      onClick={() => window.ChannelIO?.('showMessenger')}
      className="flex h-8 w-full items-center justify-between rounded-[var(--md-sys-shape-small)] px-2 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]"
    >
      <MessageCircle size={18} aria-hidden="true" />
      <span className="text-sm group-data-[collapsible=icon]:hidden">문의하기</span>
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
          'flex w-full flex-row items-center justify-between gap-2',
          'group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1',
        )}
      >
        <ThemeToggle />
        <ShellSidebarTrigger className="hidden md:flex" />
      </div>
    </div>
  );
}
