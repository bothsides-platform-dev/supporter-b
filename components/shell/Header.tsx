'use client';

import { Suspense } from 'react';
import { Breadcrumb } from '@/components/shell/Breadcrumb';
import { SearchBar } from '@/components/shell/header/SearchBar';
import { RefreshHeaderButton } from '@/components/shell/header/RefreshHeaderButton';
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
import { UserMenu } from '@/components/shell/UserMenu';
import { useHeaderActionsStore } from '@/lib/stores/header-actions';
import { cn } from '@/lib/utils';
import type { WorkspaceType } from '@/lib/types/workspace';

type HeaderProps = {
  user: { id: string; name: string; email: string; avatarUpdatedAt: string | null };
  workspaceType: WorkspaceType;
  className?: string;
};

/**
 * Header — sits above the main content (Linear "정통": not over the sidebar).
 * Left: 사이드바 접기 토글 + URL-derived breadcrumb. Right: page-specific actions (e.g. refresh) + search bar (⌘K) + user menu.
 *
 * 접기 토글이 사이드바 푸터가 아니라 여기 사는 이유: 접힘/펼침과 무관하게 자리가
 * 고정되고(48px 레일 안에서 자리다툼 없음), 모바일 상단 바(MobileShellBar)와 같은
 * 문법이 된다. Header 자체가 `hidden md:flex` 라 모바일과 중복되지 않는다.
 */
export function Header({ user, workspaceType, className }: HeaderProps) {
  const refreshSlot = useHeaderActionsStore((s) => s.refreshSlot);

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 bg-[var(--shell-chrome-bg)] px-4',
        className,
      )}
    >
      {/* -ml-1 로 아이콘 광학 중심을 헤더 좌엣지 쪽으로 당긴다(px-4 - 4px). */}
      <ShellSidebarTrigger className="-ml-1" />
      <div className="min-w-0 flex-1">
        <Suspense fallback={null}>
          <Breadcrumb />
        </Suspense>
      </div>
      {refreshSlot && (
        <RefreshHeaderButton
          onRefresh={refreshSlot.onRefresh}
          lastRefreshedAt={refreshSlot.lastRefreshedAt}
          isRefreshing={refreshSlot.isRefreshing}
        />
      )}
      <SearchBar />
      <UserMenu user={user} workspaceType={workspaceType} />
    </header>
  );
}
