'use client';

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { SidebarBrand } from '@/components/shell/SidebarBrand';
import { SidebarFooterControls } from '@/components/shell/SidebarFooterControls';
import { NavItem } from '@/components/shell/sidebar/NavItem';
import { SidebarSection } from '@/components/shell/sidebar/SidebarSection';
import type { WorkspaceType } from '@/lib/types/workspace';
import { getNavConfig } from '@/lib/nav/nav-config';
import { isNavHrefActive } from '@/lib/nav/is-nav-active';
import { useNavPathname, isInertDemoNavHref } from '@/lib/nav/demo-nav-context';

const TYPE_BADGE: Record<WorkspaceType, string> = { buyer: '구매사', pg: '판매사' };

// 임베디드 데모용 사이드바 — 실제 shell 사이드바와 동일한 chrome(NavItem/SidebarSection/
// SidebarBrand)을 재사용하되, 전역 단축키(useGoToShortcut)·알림 스트림(useNotifications)·
// 워크스페이스 전환(switchWorkspaceAction)은 싣지 않는다. 활성 상태는 데모 내비 컨텍스트가 구동.
// workspaceType/isInert 로 구매사·PG 양쪽 데모에서 재사용한다(기본 구매사).
export function DemoSidebar({
  workspaceName,
  workspaceType = 'buyer',
  isInert = isInertDemoNavHref,
}: {
  workspaceName: string;
  workspaceType?: WorkspaceType;
  isInert?: (href: string) => boolean;
}) {
  const pathname = useNavPathname();
  const { top, sections } = getNavConfig(workspaceType);

  return (
    <ShadcnSidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="flex flex-col gap-0 p-2 pb-1">
        <div className="flex h-9 items-center px-1 overflow-hidden">
          <SidebarBrand />
        </div>
        <div className="border-b border-[var(--md-sys-color-outline-variant)] group-data-[collapsible=icon]:hidden mb-1" />
        {/* 정적 워크스페이스 표기 (실제 WorkspaceSwitcher 트리거 모양, 비대화형) */}
        <div className="flex items-center gap-2 rounded-[var(--md-sys-shape-small)] px-1.5 py-1.5 group-data-[collapsible=icon]:justify-center">
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--md-sys-color-primary-container)] text-[11px] font-medium text-[var(--md-sys-color-on-primary-container)]"
          >
            {workspaceName.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:hidden">
            {workspaceName}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-1.5 py-0.5 text-[10px] text-[var(--md-sys-color-on-surface-variant)] group-data-[collapsible=icon]:hidden">
            {TYPE_BADGE[workspaceType]}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <nav aria-label="기본 내비게이션" className="flex flex-col gap-0.5">
          {top.map((item) => (
            <NavItem
              key={item.id}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isNavHrefActive(pathname, item.href)}
              inert={isInert(item.href)}
            />
          ))}
          {sections.map((section) => (
            <SidebarSection key={section.id} section={section} inertHref={isInert} />
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] p-2">
        <div aria-hidden className="pointer-events-none min-w-0 flex-1 opacity-50">
          <SidebarFooterControls className="min-w-0 flex-1" />
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
