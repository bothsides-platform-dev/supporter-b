'use client';

import { useMemo, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useGoToShortcut } from '@/lib/hooks/useGoToShortcut';
import { getNavConfig, getChordMap } from '@/lib/nav/nav-config';
import type {
  WorkspaceMembershipSummary,
  WorkspaceType,
} from '@/lib/types/workspace';

export type SidebarProps = {
  user: { id: string; email: string; name: string };
  workspaceType: 'buyer' | 'pg';
  workspaces: WorkspaceMembershipSummary[];
  current: { id: string; name: string; type: WorkspaceType };
};

function SidebarNav({
  workspaceType,
  onNavigate,
}: {
  workspaceType: WorkspaceType;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const { top, sections } = getNavConfig(workspaceType);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="flex flex-col gap-0.5">
      {top.map((item) => (
        <NavItem
          key={item.id}
          href={item.href}
          label={item.label}
          icon={item.icon}
          shortcut={item.shortcut}
          active={isActive(item.href)}
          onNavigate={onNavigate}
          badge={
            item.id === 'notifications' && unreadCount > 0 ? (
              <span
                data-testid="unread-badge"
                aria-label={`미읽음 ${unreadCount}건`}
                className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--md-sys-color-warning)] px-1 text-[10px] font-medium text-white md-numeric group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:ml-0"
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
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  return (
    <>
      <SidebarHeader className="flex-row items-center gap-1 p-2">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher current={current} workspaces={workspaces} />
        </div>
        <ShellSidebarTrigger className="hidden shrink-0 md:inline-flex" />
      </SidebarHeader>

      <SidebarContent className="px-2">
        <nav aria-label="기본 내비게이션" className="flex flex-col gap-0.5">
          <Suspense fallback={null}>
            <SidebarNav workspaceType={workspaceType} onNavigate={onNavigate} />
          </Suspense>
        </nav>
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] p-2">
        <ThemeToggle />
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
      <ShadcnSidebar
        collapsible="icon"
        variant="sidebar"
        className="border-[var(--md-sys-color-outline-variant)]"
      >
        <SidebarBody {...props} onNavigate={closeMobile} />
        <SidebarRail />
      </ShadcnSidebar>
    </TooltipProvider>
  );
}
