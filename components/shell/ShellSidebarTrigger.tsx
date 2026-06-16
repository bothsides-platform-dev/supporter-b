'use client';

import { PanelLeftIcon } from 'lucide-react';
import { ModifierShortcut } from '@/components/primitives/ModifierShortcut';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMac } from '@/lib/hooks/usePlatform';
import { cn } from '@/lib/utils';

type ShellSidebarTriggerProps = {
  className?: string;
};

const SIDEBAR_TOGGLE_SHORTCUT_KEY = 'B';

export function ShellSidebarTrigger({ className }: ShellSidebarTriggerProps) {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const isMac = useIsMac();
  const isExpanded = state === 'expanded';
  const label = isExpanded ? '사이드바 접기' : '사이드바 펼치기';
  const showTooltip = !isMobile;

  const button = (
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
        size={18}
        aria-hidden="true"
        className={cn('transition-transform duration-200', !isExpanded && 'rotate-180')}
      />
      {isExpanded && !isMobile ? (
        <span
          aria-hidden="true"
          className="text-sm text-[length:var(--md-typescale-label-large-size)] group-data-[collapsible=icon]:hidden"
        >
          사이드바 접기
        </span>
      ) : null}
    </button>
  );

  // Always wrap in Tooltip so the trigger button stays mounted; otherwise
  // toggling expanded ↔ collapsed remounts the button and skips rotate-180 transition.
  return (
    <Tooltip disabled={!showTooltip}>
      <TooltipTrigger disabled={!showTooltip} render={button} />
      {showTooltip ? (
        <TooltipContent side="right" sideOffset={8} className="gap-2">
          <span>{label}</span>
          <ModifierShortcut shortcutKey={SIDEBAR_TOGGLE_SHORTCUT_KEY} isMac={isMac} />
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
