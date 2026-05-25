'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/icons';
import { NavItem } from '@/components/shell/sidebar/NavItem';
import { useSidebarSectionsStore } from '@/lib/stores/sidebar-sections';
import type { NavSection } from '@/lib/nav/nav-config';
import { isNavHrefActive, isNavSectionHeaderActive } from '@/lib/nav/is-nav-active';
import { cn } from '@/lib/utils';

const subItemBase =
  'flex h-7 items-center gap-2 rounded-[var(--md-sys-shape-small)] pl-9 pr-2.5 text-[length:var(--md-typescale-label-medium-size)] tracking-[var(--md-typescale-label-medium-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)]';

const subItemActive =
  'bg-[var(--md-sys-color-primary-container)] font-medium text-[var(--md-sys-color-on-primary-container)]';

const subItemInactive =
  'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]';

type SidebarSectionProps = {
  section: NavSection;
  onNavigate?: () => void;
};

/**
 * SidebarSection — a collapsible nav group. The header is a NavItem (clickable
 * link + hover shortcut) preceded by a chevron toggle. Children are either
 * status sub-items (/base?status=…) or static sub-links (settings). Collapse
 * state persists via the sidebar-sections store.
 */
export function SidebarSection({ section, onNavigate }: SidebarSectionProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const collapsed = useSidebarSectionsStore((s) => s.isCollapsed(section.id));
  const toggle = useSidebarSectionsStore((s) => s.toggle);

  const status = searchParams.get('status');
  const headerActive =
    section.base != null &&
    isNavSectionHeaderActive(pathname, section.base, status);
  const onListBase = section.base != null && pathname === section.base;

  return (
    <div className="mt-3 group-data-[collapsible=icon]:mt-1">
      <div className="flex items-center">
        <button
          type="button"
          aria-label={`${section.label} 섹션`}
          aria-expanded={!collapsed}
          onClick={() => toggle(section.id)}
          className="inline-flex h-8 w-6 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:hidden"
        >
          {collapsed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
        </button>
        <NavItem
          href={section.href}
          label={section.label}
          icon={section.icon}
          shortcut={section.shortcut}
          active={headerActive}
          onNavigate={onNavigate}
          className="min-w-0 flex-1"
        />
      </div>

      {!collapsed && (
        <div className="mt-0.5 flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
          {section.links?.map((link) => {
            const active = isNavHrefActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(subItemBase, active ? subItemActive : subItemInactive)}
              >
                {link.label}
              </Link>
            );
          })}
          {section.statuses?.map(({ status: s, label }) => {
            const active = onListBase && status === s;
            return (
              <Link
                key={s}
                href={`${section.base}?status=${s}`}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(subItemBase, active ? subItemActive : subItemInactive)}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
