'use client';

import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { ShortcutHint } from '@/components/shell/ShortcutHint';
import type { NavShortcut } from '@/lib/nav/nav-config';
import { cn } from '@/lib/utils';

const subItemBase =
  'flex h-7 items-center gap-2 rounded-[var(--md-sys-shape-small)] pl-9 pr-2.5 text-[length:var(--md-typescale-label-medium-size)] tracking-[var(--md-typescale-label-medium-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)]';

const subItemActive =
  'bg-[var(--md-sys-color-primary-container)] font-medium text-[var(--md-sys-color-on-primary-container)]';

const subItemInactive =
  'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]';

type SidebarSubItemProps = {
  href: string;
  label: string;
  shortcut?: NavShortcut;
  active?: boolean;
  onNavigate?: () => void;
};

/**
 * SidebarSubItem — a nav sub-link inside a SidebarSection (status filter or
 * static link). Mirrors NavItem: when the sidebar is expanded and a shortcut is
 * configured, a hover tooltip surfaces the label + keycaps. Sub-items are
 * hidden entirely in collapsed/icon mode, so the tooltip exists only to reveal
 * the shortcut. Active state is computed by the caller.
 */
export function SidebarSubItem({
  href,
  label,
  shortcut,
  active = false,
  onNavigate,
}: SidebarSubItemProps) {
  const { state, isMobile } = useSidebar();
  const showTooltip = state === 'expanded' && !isMobile && shortcut != null;

  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(subItemBase, active ? subItemActive : subItemInactive)}
    >
      {label}
    </Link>
  );

  if (!showTooltip) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" sideOffset={8} className="gap-2">
        <span>{label}</span>
        {shortcut ? <ShortcutHint shortcut={shortcut} /> : null}
      </TooltipContent>
    </Tooltip>
  );
}
