'use client';

import { useMemo, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarFooterControls } from '@/components/shell/SidebarFooterControls';
import { UserMenu } from '@/components/shell/UserMenu';
import { WorkspaceSwitcher } from '@/components/shell/WorkspaceSwitcher';
import { NavItem } from '@/components/shell/sidebar/NavItem';
import { SidebarSection } from '@/components/shell/sidebar/SidebarSection';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { SidebarBrand } from '@/components/shell/SidebarBrand';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useGoToShortcut } from '@/lib/hooks/useGoToShortcut';
import { getNavConfig, getChordMap } from '@/lib/nav/nav-config';
import { isNavHrefActive } from '@/lib/nav/is-nav-active';
import type {
  WorkspaceMembershipSummary,
  WorkspaceType,
} from '@/lib/types/workspace';

export type SidebarProps = {
  user: { id: string; email: string; name: string };
  workspaceType: 'buyer' | 'pg';
  workspaces: WorkspaceMembershipSummary[];
  current: { id: string; name: string; type: WorkspaceType; hasLogo: boolean };
  isMaster?: boolean;
};

function SidebarNav({
  workspaceType,
  workspaceId,
  onNavigate,
}: {
  workspaceType: WorkspaceType;
  workspaceId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // 현재 워크스페이스 id 를 넘겨 전환 시 알림 싱글턴이 리셋되게 한다(Phase 7b).
  const { unreadCount } = useNotifications(workspaceId);
  const { top, sections } = getNavConfig(workspaceType);

  return (
    <div className="flex flex-col gap-0.5">
      {top.map((item) => (
        <NavItem
          key={item.id}
          href={item.href}
          label={item.label}
          icon={item.icon}
          shortcut={item.shortcut}
          active={isNavHrefActive(pathname, item.href)}
          onNavigate={onNavigate}
          badge={
            item.id === 'notifications' && unreadCount > 0 ? (
              <span
                data-testid="unread-badge"
                aria-label={`미읽음 ${unreadCount}건`}
                className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--md-sys-color-warning)] px-1 text-[10px] font-medium text-[var(--md-sys-color-on-warning)] md-numeric"
              >
                {unreadCount}
              </span>
            ) : undefined
          }
        />
      ))}

      {sections.map((section) => (
        <SidebarSection key={section.id} section={section} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function SidebarBody({
  user,
  workspaceType,
  workspaces,
  current,
  isMaster,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  return (
    <>
      <SidebarHeader className="flex flex-col gap-0 p-2 pb-1">
        {/* 아이콘 고정 + 워드마크는 글자 단위 stagger 애니메이션 (SidebarBrand). overflow-hidden으로 접힘 시 글자 spill 방지 */}
        <div className="flex h-9 items-center px-1 overflow-hidden">
          <SidebarBrand />
        </div>
        <div className="border-b border-[var(--md-sys-color-outline-variant)] group-data-[collapsible=icon]:hidden mb-1" />
        <div className="min-w-0">
          <WorkspaceSwitcher current={current} workspaces={workspaces} isMaster={isMaster} />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <nav aria-label="기본 내비게이션" className="flex flex-col gap-0.5">
          <Suspense fallback={null}>
            <SidebarNav
              workspaceType={workspaceType}
              workspaceId={current.id}
              onNavigate={onNavigate}
            />
          </Suspense>
        </nav>
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] p-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1">
        <SidebarFooterControls className="min-w-0 flex-1" />
        <div className="ml-auto md:hidden">
          <UserMenu
            user={{ name: user.name, email: user.email }}
            workspaceType={workspaceType}
          />
        </div>
      </SidebarFooter>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  const { setOpenMobile } = useSidebar();
  const chordMap = useMemo(
    () => getChordMap(props.workspaceType),
    [props.workspaceType],
  );
  useGoToShortcut(chordMap);

  const closeMobile = () => setOpenMobile(false);

  return (
    <TooltipProvider delay={300}>
      <ShadcnSidebar collapsible="icon" variant="sidebar">
        <SidebarBody {...props} onNavigate={closeMobile} />
        <SidebarRail />
      </ShadcnSidebar>
    </TooltipProvider>
  );
}
