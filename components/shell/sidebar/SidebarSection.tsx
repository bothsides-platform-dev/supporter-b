'use client';

import { ChevronDownIcon, ChevronRightIcon } from '@/components/icons';
import { useNavPathname, useNavSearchParams } from '@/lib/nav/demo-nav-context';
import { NavItem } from '@/components/shell/sidebar/NavItem';
import { SidebarSubItem } from '@/components/shell/sidebar/SidebarSubItem';
import { useSidebarSectionsStore } from '@/lib/stores/sidebar-sections';
import type { NavSection } from '@/lib/nav/nav-config';
import { isNavHrefActive, isNavSectionHeaderActive } from '@/lib/nav/is-nav-active';

type SidebarSectionProps = {
  section: NavSection;
  onNavigate?: () => void;
  inertHref?: (href: string) => boolean;
};

/**
 * SidebarSection — a collapsible nav group. The header is a NavItem (clickable
 * link + hover shortcut) preceded by a chevron toggle. Children are either
 * status sub-items (/base?status=…) or static sub-links (settings). Collapse
 * state persists via the sidebar-sections store.
 */
export function SidebarSection({ section, onNavigate, inertHref }: SidebarSectionProps) {
  const pathname = useNavPathname();
  const searchParams = useNavSearchParams();
  const collapsed = useSidebarSectionsStore((s) => s.isCollapsed(section.id));
  const toggle = useSidebarSectionsStore((s) => s.toggle);
  const demoInert = inertHref != null;

  const status = searchParams.get('status');
  const headerActive =
    section.base != null &&
    isNavSectionHeaderActive(pathname, section.base, status);
  const onListBase = section.base != null && pathname === section.base;

  return (
    <div className="mt-3 group-data-[collapsible=icon]:mt-1">
      {/* 토글 chevron 은 행의 후행에 둔다. 선두에 두면 w-6 거터가 섹션 아이콘을
          상위 nav 아이콘보다 24px 오른쪽으로 밀어 아이콘 열이 깨지고, 그 여파로
          하위 항목(pl-9)이 상위 라벨과 같은 들여쓰기에 놓여 형제처럼 읽힌다. */}
      <div className="flex items-center">
        <NavItem
          href={section.href}
          label={section.label}
          icon={section.icon}
          shortcut={section.shortcut}
          active={headerActive}
          onNavigate={onNavigate}
          inert={inertHref?.(section.href)}
          className="min-w-0 flex-1"
        />
        {demoInert ? (
          <span
            aria-hidden
            className="inline-flex h-8 w-6 shrink-0 items-center justify-center text-[var(--md-sys-color-on-surface-variant)] opacity-50 group-data-[collapsible=icon]:hidden"
          >
            <ChevronDownIcon size={14} />
          </span>
        ) : (
          <button
            type="button"
            aria-label={`${section.label} 섹션`}
            aria-expanded={!collapsed}
            onClick={() => toggle(section.id)}
            className="inline-flex h-8 w-6 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:hidden"
          >
            {collapsed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
          </button>
        )}
      </div>

      {(!collapsed || demoInert) && (
        <div className="mt-0.5 flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
          {section.links?.map((link) => (
            <SidebarSubItem
              key={link.href}
              href={link.href}
              label={link.label}
              shortcut={link.shortcut}
              active={isNavHrefActive(pathname, link.href)}
              onNavigate={onNavigate}
              inert={inertHref?.(link.href)}
            />
          ))}
          {section.statuses?.map(({ status: s, label, shortcut }) => (
            <SidebarSubItem
              key={s}
              href={`${section.base}?status=${s}`}
              label={label}
              shortcut={shortcut}
              active={onListBase && status === s}
              onNavigate={onNavigate}
              inert={inertHref?.(`${section.base}?status=${s}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
