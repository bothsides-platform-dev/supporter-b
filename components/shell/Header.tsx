'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/shell/Breadcrumb';
import { SearchBar } from '@/components/shell/header/SearchBar';
import { Avatar } from '@/components/primitives/Avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { WorkspaceType } from '@/lib/types/workspace';

type HeaderProps = {
  user: { name: string; email: string };
  workspaceType: WorkspaceType;
  className?: string;
};

/**
 * Header — sits above the main content (Linear "정통": not over the sidebar).
 * Left: URL-derived breadcrumb. Right: search bar (⌘K) + user menu.
 */
export function Header({ user, workspaceType, className }: HeaderProps) {
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <Suspense fallback={null}>
          <Breadcrumb />
        </Suspense>
      </div>
      <SearchBar />
      <UserMenu user={user} workspaceType={workspaceType} />
    </header>
  );
}

function UserMenu({ user, workspaceType }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="사용자 메뉴"
        className="flex items-center rounded-[var(--md-sys-shape-small)] p-0.5 outline-none transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
      >
        <Avatar name={user.name} color="surface" size="sm" className="cursor-pointer" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="min-w-[200px] rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-1 shadow-[var(--md-sys-elevation-2)]"
      >
        <div className="px-2 py-1.5">
          <p className="text-[length:var(--md-typescale-label-large-size)] font-[number:var(--md-typescale-label-large-weight)] text-[var(--md-sys-color-on-surface)]">
            {user.name}
          </p>
          <p className="mt-0.5 text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
            {user.email}
          </p>
          <p className="mt-1 text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
            {workspaceType === 'buyer' ? '구매사' : 'PG'}
          </p>
        </div>
        <DropdownMenuSeparator className="bg-[var(--md-sys-color-outline-variant)]" />
        <DropdownMenuItem
          onClick={() => router.push('/settings/profile')}
          className="cursor-pointer rounded-[var(--md-sys-shape-extra-small)] px-2 py-1.5 text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"
        >
          설정
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer rounded-[var(--md-sys-shape-extra-small)] px-2 py-1.5 text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"
        >
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
