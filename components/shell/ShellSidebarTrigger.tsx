'use client';

import { PanelLeftIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type ShellSidebarTriggerProps = {
  className?: string;
};

export function ShellSidebarTrigger({ className }: ShellSidebarTriggerProps) {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const isExpanded = state === 'expanded';
  const label = isExpanded ? '사이드바 접기' : '사이드바 펼치기';
  const showCollapsedTooltip = state === 'collapsed' && !isMobile;

  const button = (
    <button
      type="button"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      aria-label={label}
      onClick={toggleSidebar}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] p-0 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
        className,
      )}
    >
      <PanelLeftIcon
        size={18}
        aria-hidden="true"
        className={cn('transition-transform duration-200', !isExpanded && 'rotate-180')}
      />
    </button>
  );

  if (!showCollapsedTooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
