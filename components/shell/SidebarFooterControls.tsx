'use client';

import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
import { cn } from '@/lib/utils';

type SidebarFooterControlsProps = {
  className?: string;
};

/**
 * Footer utility cluster — theme toggle + sidebar collapse (desktop).
 * Icon-only controls; collapse label is exposed via aria-label and tooltip on icon rail.
 */
export function SidebarFooterControls({ className }: SidebarFooterControlsProps) {
  return (
    <div
      data-testid="sidebar-footer-toolbar"
      className={cn(
        'flex flex-row items-center gap-0.5',
        'md:ml-auto md:justify-end',
        'group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1',
        className,
      )}
    >
      <ThemeToggle />
      <ShellSidebarTrigger className="hidden md:flex" />
    </div>
  );
}
