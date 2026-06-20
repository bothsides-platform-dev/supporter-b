'use client';

import { Suspense } from 'react';
import { Breadcrumb } from '@/components/shell/Breadcrumb';
import { SearchBar } from '@/components/shell/header/SearchBar';
import { RefreshHeaderButton } from '@/components/shell/header/RefreshHeaderButton';
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
 * Left: URL-derived breadcrumb. Right: page-specific actions (e.g. refresh) + search bar (⌘K) + user menu.
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
