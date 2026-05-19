'use client';

import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/stores/ui';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { IconButton } from '@/components/primitives/IconButton';
import { BellIcon, SearchIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Avatar } from '@/components/primitives/Avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export type TopbarProps = {
  user: { id: string; email: string; name: string };
  workspaceType: 'buyer' | 'pg';
  workspaceName: string;
};

export function Topbar({ user, workspaceType }: TopbarProps) {
  const { openNotificationDrawer, openCommandPalette } = useUIStore();
  const { unreadCount } = useNotifications();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header
      style={{ gridArea: 'topbar' }}
      className="fixed top-0 left-[var(--shell-rail)] right-0 z-20 h-[var(--shell-topbar)] flex items-center justify-between px-4 md:px-6 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]"
    >
      {/* Search shortcut */}
      <button
        type="button"
        onClick={openCommandPalette}
        className="flex items-center md:gap-2 h-8 w-8 md:w-72 px-0 md:px-3 justify-center md:justify-start rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface)] transition-colors duration-[140ms]"
        aria-label="검색 (⌘K)"
      >
        <SearchIcon size={14} />
        <span className="hidden md:inline text-[length:var(--md-typescale-label-large-size)]">검색</span>
        <kbd className="hidden md:block ml-auto text-[length:var(--md-typescale-label-small-size)] opacity-50">⌘K</kbd>
      </button>

      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <div className="relative">
          <IconButton label="알림" onClick={openNotificationDrawer}>
            <BellIcon size={18} />
          </IconButton>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--md-sys-color-warning)]" />
          )}
        </div>

        <ThemeToggle />

        {/* User avatar + profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none rounded-[var(--md-sys-shape-full)]">
            <Avatar name={user.name} color="surface" size="sm" className="cursor-pointer" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="end"
            sideOffset={8}
            className="min-w-[180px] rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-1 shadow-[var(--md-sys-elevation-2)]"
          >
            <div className="px-2 py-1.5">
              <p className="text-[length:var(--md-typescale-label-large-size)] font-[number:var(--md-typescale-label-large-weight)] text-[var(--md-sys-color-on-surface)]">
                {user.name}
              </p>
              <p className="text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                {user.email}
              </p>
              <p className="text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                {workspaceType === 'buyer' ? '구매사' : 'PG'}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-[var(--md-sys-color-outline-variant)]" />
            <DropdownMenuItem
              onClick={() => router.push('/settings/profile')}
              className="text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] cursor-pointer px-2 py-1.5 rounded-[var(--md-sys-shape-extra-small)] hover:bg-[var(--md-sys-color-surface-container-high)]"
            >
              설정
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] cursor-pointer px-2 py-1.5 rounded-[var(--md-sys-shape-extra-small)] hover:bg-[var(--md-sys-color-surface-container-high)]"
            >
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
