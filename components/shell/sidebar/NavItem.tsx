'use client';

import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ShortcutHint } from '@/components/shell/ShortcutHint';
import type { IconComponent, NavShortcut } from '@/lib/nav/nav-config';
import { cn } from '@/lib/utils';

const navItemBase =
  'flex h-8 items-center gap-2.5 rounded-[var(--md-sys-shape-small)] px-2.5 text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)] [&_svg]:size-[18px] [&_svg]:shrink-0';

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
 * supplied it gets a Linear-style hover tooltip showing the keyboard hint.
 * Active state is computed by the caller and passed in.
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
  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(navItemBase, active ? navItemActive : navItemInactive, className)}
    >
      {Icon && <Icon size={18} />}
      <span>{label}</span>
      {badge && <span className="ml-auto">{badge}</span>}
    </Link>
  );

  if (!shortcut) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" sideOffset={8} className="gap-2">
        <span>{label}</span>
        <ShortcutHint shortcut={shortcut} />
      </TooltipContent>
    </Tooltip>
  );
}
