'use client';

import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
import { cn } from '@/lib/utils';

type SidebarFooterControlsProps = {
  className?: string;
};

/**
 * Footer utilities — theme toggle (left) and sidebar collapse (right) on desktop.
 * Icon rail: vertical stack; collapse label hidden, tooltip only.
 */
export function SidebarFooterControls({ className }: SidebarFooterControlsProps) {
  return (
    <div
      data-testid="sidebar-footer-toolbar"
      className={cn(
        'flex w-full flex-row items-center justify-between gap-2',
        'group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1',
        className,
      )}
    >
      <ThemeToggle />
      <ShellSidebarTrigger className="hidden md:flex" />
    </div>
  );
}
