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
  inert?: boolean;
};

/**
 * NavItem — a top-level sidebar nav link (icon + label). Collapsed sidebar
 * shows label (+ shortcut) in a hover tooltip; expanded sidebar does the same
 * when a shortcut is configured. Active state is computed by the caller.
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
  inert = false,
}: NavItemProps) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;
  const showShortcutTooltip = state === 'expanded' && !isMobile && shortcut != null;
  const showTooltip = isCollapsed || showShortcutTooltip;

  if (inert) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          navItemBase,
          'text-[var(--md-sys-color-on-surface-variant)] opacity-50 cursor-default select-none',
          className,
        )}
      >
        {Icon && (
          <span className="relative inline-flex shrink-0">
            <Icon size={18} />
          </span>
        )}
        <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
      </span>
    );
  }

  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(navItemBase, active ? navItemActive : navItemInactive, className)}
    >
      {Icon && (
        <span className="relative inline-flex shrink-0">
          <Icon size={18} />
          {badge && (
            // 접힘 모드에서 실제로 보이는 배지. 펼침용(아래 ml-auto)은 그때
            // display:none 이 되므로 두 벌이 동시에 낭독되지 않는다 — 여기에
            // aria-hidden 을 붙이면 접힘 상태에서 미읽음 개수가 어느 경로로도
            // 노출되지 않는다.
            <span className="hidden group-data-[collapsible=icon]:flex absolute -top-1.5 -right-1.5 pointer-events-none">
              {badge}
            </span>
          )}
        </span>
      )}
      <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
      {badge && <span className="ml-auto group-data-[collapsible=icon]:hidden">{badge}</span>}
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
