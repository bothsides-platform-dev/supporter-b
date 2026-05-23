'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HomeIcon,
  FileTextIcon,
  SettingsIcon,
  BellIcon,
  SearchIcon,
} from '@/components/icons';
import { Logo } from '@/components/primitives/Logo';
import { Avatar } from '@/components/primitives/Avatar';
import { IconButton } from '@/components/primitives/IconButton';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { WorkspaceSwitcher } from '@/components/shell/WorkspaceSwitcher';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/lib/stores/ui';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useIsMac, formatModifierShortcut } from '@/lib/hooks/usePlatform';
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

type NavItem = { href: string; icon: React.ReactNode; label: string; match: string };

function navItemsFor(workspaceType: 'buyer' | 'pg'): NavItem[] {
  return [
    { href: '/home', icon: <HomeIcon />, label: '홈', match: '/home' },
    workspaceType === 'buyer'
      ? { href: '/rfp', icon: <FileTextIcon />, label: '제안', match: '/rfp' }
      : { href: '/inbox', icon: <FileTextIcon />, label: '제안', match: '/inbox' },
    { href: '/settings/profile', icon: <SettingsIcon />, label: '설정', match: '/settings' },
  ];
}

/** The sidebar's inner content — shared by the desktop rail and the mobile drawer. */
function SidebarBody({ user, workspaceType, workspaces, current, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openNotificationDrawer, openCommandPalette } = useUIStore();
  const { unreadCount } = useNotifications();
  const isMac = useIsMac();
  const searchShortcut = formatModifierShortcut('K', isMac);
  const navItems = navItemsFor(workspaceType);

  async function handleLogout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="flex h-full flex-col gap-1 px-2.5 py-3">
      {/* Header — logo + workspace switcher */}
      <div className="flex items-center gap-2 px-1">
        <Logo variant="compact" className="size-6 [&_svg]:size-6" />
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher current={current} workspaces={workspaces} />
        </div>
      </div>

      {/* Search (command palette) */}
      <button
        type="button"
        onClick={() => { openCommandPalette(); onNavigate?.(); }}
        aria-label={`검색 (${searchShortcut})`}
        className="mt-2 flex h-8 w-full items-center gap-2 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 text-[var(--md-sys-color-on-surface-variant)] transition-colors duration-[var(--md-sys-motion-duration-short-4)] hover:border-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface)]"
      >
        <SearchIcon size={14} />
        <span className="text-[length:var(--md-typescale-label-large-size)]">검색</span>
        <kbd className="ml-auto text-[length:var(--md-typescale-label-small-size)] opacity-60">{searchShortcut}</kbd>
      </button>

      {/* Primary navigation */}
      <nav aria-label="기본 내비게이션" className="mt-2 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = pathname === item.match || pathname.startsWith(item.match + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-[var(--md-sys-shape-small)] px-2.5 text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)] [&_svg]:size-[18px] [&_svg]:shrink-0',
                active
                  ? 'bg-[var(--md-sys-color-primary-container)] font-medium text-[var(--md-sys-color-on-primary-container)]'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer — notifications, theme, user */}
      <div className="mt-auto flex items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] pt-2">
        <div className="relative">
          <IconButton label="알림" size="sm" onClick={() => { openNotificationDrawer(); onNavigate?.(); }}>
            <BellIcon size={18} />
          </IconButton>
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--md-sys-color-warning)]" />
          )}
        </div>
        <ThemeToggle />
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-[var(--md-sys-shape-small)] px-1 py-1 outline-none transition-colors hover:bg-[var(--md-sys-color-surface-container)]">
              <Avatar name={user.name} color="surface" size="sm" className="cursor-pointer" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
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
                onClick={() => { router.push('/settings/profile'); onNavigate?.(); }}
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
        </div>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden md:flex md:sticky md:top-0 md:h-svh md:w-[var(--shell-sidebar)] md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-[var(--md-sys-color-outline-variant)] md:bg-[var(--md-sys-color-surface)]">
        <SidebarBody {...props} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 md:hidden">
        <IconButton label="메뉴 열기" size="sm" onClick={() => setMobileOpen(true)}>
          <MenuIcon size={18} />
        </IconButton>
        <Logo variant="compact" className="size-6 [&_svg]:size-6" />
        <span className="truncate text-[length:var(--md-typescale-label-large-size)] font-medium text-[var(--md-sys-color-on-surface)]">
          {props.current.name}
        </span>
      </header>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[var(--shell-sidebar)] max-w-[80vw] border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-0"
        >
          <SidebarBody {...props} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
