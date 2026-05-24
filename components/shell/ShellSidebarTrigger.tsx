'use client';

import { PanelLeftIcon } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type ShellSidebarTriggerProps = {
  className?: string;
};

export function ShellSidebarTrigger({ className }: ShellSidebarTriggerProps) {
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === 'expanded';
  const label = isExpanded ? '사이드바 접기' : '사이드바 펼치기';

  return (
    <button
      type="button"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      aria-label={label}
      onClick={toggleSidebar}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--md-sys-shape-small)] px-2 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
        className,
      )}
    >
      <PanelLeftIcon
        size={16}
        aria-hidden="true"
        className={cn('transition-transform duration-200', !isExpanded && 'rotate-180')}
      />
      <span aria-hidden="true" className="text-sm group-data-[collapsible=icon]:hidden">
        {isExpanded ? '접기' : '열기'}
      </span>
    </button>
  );
}
