'use client';

import { Suspense } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Header } from '@/components/shell/Header';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { NavigationHistoryTracker } from '@/components/shell/NavigationHistoryTracker';
import { Sidebar, type SidebarProps } from '@/components/shell/Sidebar';
import { cn } from '@/lib/utils';
import type { WorkspaceType } from '@/lib/types/workspace';

const sidebarProviderStyle = {
  '--sidebar-width': 'var(--shell-sidebar)',
  '--sidebar-width-icon': '3rem',
} as React.CSSProperties;

export type AppSidebarLayoutProps = {
  sidebar: SidebarProps;
  header?: {
    user: { id: string; name: string; email: string; avatarUpdatedAt: string | null };
    workspaceType: WorkspaceType;
    className?: string;
  };
  children: React.ReactNode;
  mainClassName?: string;
  /**
   * 직전에 접어둔 상태. 서버가 `sidebar_state` 쿠키에서 읽어 넘긴다
   * (`app/(app)/layout.tsx` → `lib/shell/sidebar-cookie.ts`). 서버가 넘기므로
   * 첫 페인트부터 접힌 폭으로 그려진다 — 펼쳤다 접히는 깜빡임이 없다.
   * 넘기지 않으면(첫 방문) 펼침이 기본이다.
   */
  defaultSidebarOpen?: boolean;
};

export function AppSidebarLayout({
  sidebar,
  header,
  children,
  mainClassName,
  defaultSidebarOpen = true,
}: AppSidebarLayoutProps) {
  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen} style={sidebarProviderStyle}>
      <Suspense fallback={null}>
        <NavigationHistoryTracker />
      </Suspense>
      <Sidebar {...sidebar} />
      <SidebarInset className="flex min-w-0 flex-1 flex-col bg-[var(--shell-chrome-bg)]">
        <MobileShellBar workspaceName={sidebar.current.name} />
        {header ? (
          <Header
            user={header.user}
            workspaceType={header.workspaceType}
            className={cn('hidden md:flex', header.className)}
          />
        ) : null}
        <div className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto', mainClassName)}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
