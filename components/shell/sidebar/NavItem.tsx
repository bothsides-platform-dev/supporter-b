'use client';

import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { ShortcutHint } from '@/components/shell/ShortcutHint';
import type { IconComponent, NavShortcut } from '@/lib/nav/nav-config';
import { cn } from '@/lib/utils';

const navItemBase =
  'relative flex h-8 items-center gap-2.5 rounded-[var(--md-sys-shape-small)] px-2.5 text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 [&_svg]:size-[18px] [&_svg]:shrink-0';

const navItemActive =
  'bg-[var(--md-sys-color-primary-container)] font-medium text-[var(--md-sys-color-on-primary-container)]';

const navItemInactive =
  'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]';

type NavItemProps = {
  href: string;
  label: string;
  icon?: IconComponent;
  shortcut?: NavShortcut;
  active?: boolean;
  badge?: React.ReactNode;
  className?: string;
  onNavigate?: () => void;
};

/**
 * NavItem — a top-level sidebar nav link (icon + label). When a shortcut is
 * supplied, expanded sidebar shows an inline keycap hint on hover; collapsed
 * sidebar shows label + hint in a tooltip. Active state is computed by the caller.
 */
export function NavItem({
  href,
  label,
  icon: Icon,
  shortcut,
  active = false,
  badge,
  className,
  onNavigate,
}: NavItemProps) {
  const { state, isMobile } = useSidebar();
  const showCollapsedTooltip = state === 'collapsed' && !isMobile;
  const showInlineShortcut = state === 'expanded' && !isMobile && shortcut != null;

  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(navItemBase, active ? navItemActive : navItemInactive, 'group', className)}
    >
      {Icon && <Icon size={18} />}
      <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
      {(showInlineShortcut || badge) && (
        <span className="ml-auto flex items-center gap-1.5 group-data-[collapsible=icon]:ml-0">
          {showInlineShortcut && (
            <span className="opacity-0 transition-opacity duration-[var(--md-sys-motion-duration-short-4)] group-hover:opacity-100 group-data-[collapsible=icon]:hidden">
              <ShortcutHint shortcut={shortcut} />
            </span>
          )}
          {badge}
        </span>
      )}
    </Link>
  );

  if (!showCollapsedTooltip) return link;

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
