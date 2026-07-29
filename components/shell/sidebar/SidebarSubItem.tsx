'use client';

import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { ShortcutHint } from '@/components/shell/ShortcutHint';
import type { NavShortcut } from '@/lib/nav/nav-config';
import { cn } from '@/lib/utils';

// pl-[38px] = 상위 NavItem 라벨의 시작 위치(px-2.5 10px + 아이콘 18px + gap-2.5 10px).
// 하위 항목 텍스트가 부모 라벨 바로 아래 열에 서야 자식으로 읽힌다 — 이보다 얕으면
// 상위 nav 라벨과 같은 들여쓰기가 되어 형제처럼 보인다.
const subItemBase =
  'flex h-7 items-center gap-2 rounded-[var(--md-sys-shape-small)] pl-[38px] pr-2.5 text-[length:var(--md-typescale-label-medium-size)] tracking-[var(--md-typescale-label-medium-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)]';

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
  inert?: boolean;
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
  inert = false,
}: SidebarSubItemProps) {
  const { state, isMobile } = useSidebar();
  const showTooltip = state === 'expanded' && !isMobile && shortcut != null;

  if (inert) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          subItemBase,
          'text-[var(--md-sys-color-on-surface-variant)] opacity-50 cursor-default select-none',
        )}
      >
        {label}
      </span>
    );
  }

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
