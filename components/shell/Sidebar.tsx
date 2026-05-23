'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HomeIcon,
  BellIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ComposeIcon,
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
import { useSidebarSectionsStore } from '@/lib/stores/sidebar-sections';
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

// ── nav item classes ───────────────────────────────────────────────────────

const navItemBase =
  'flex h-8 items-center gap-2.5 rounded-[var(--md-sys-shape-small)] px-2.5 text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)] [&_svg]:size-[18px] [&_svg]:shrink-0';

const navItemActive =
  'bg-[var(--md-sys-color-primary-container)] font-medium text-[var(--md-sys-color-on-primary-container)]';

const navItemInactive =
  'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]';

// Sub-item (status items) are slightly indented
const subItemBase =
  'flex h-7 items-center gap-2 rounded-[var(--md-sys-shape-small)] pl-7 pr-2.5 text-[length:var(--md-typescale-label-medium-size)] tracking-[var(--md-typescale-label-medium-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)]';

const subItemActive =
  'bg-[var(--md-sys-color-primary-container)] font-medium text-[var(--md-sys-color-on-primary-container)]';

const subItemInactive =
  'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]';

// ── section header ─────────────────────────────────────────────────────────

type SectionHeaderProps = {
  label: string;
  sectionId: string;
};

function SectionHeader({ label, sectionId }: SectionHeaderProps) {
  const isCollapsed = useSidebarSectionsStore((s) => s.isCollapsed(sectionId));
  const toggle = useSidebarSectionsStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={() => toggle(sectionId)}
      className="flex h-6 w-full items-center gap-1 px-2.5 text-[length:var(--md-typescale-label-small-size)] font-medium uppercase tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-on-surface)]"
    >
      {isCollapsed ? (
        <ChevronRightIcon size={12} className="shrink-0 opacity-60" />
      ) : (
        <ChevronDownIcon size={12} className="shrink-0 opacity-60" />
      )}
      <span>{label}</span>
    </button>
  );
}

// ── active-state-aware nav content (uses useSearchParams — wrapped in Suspense) ──

type ActiveNavProps = SidebarProps & { onNavigate?: () => void };

function ActiveNav({ workspaceType, onNavigate }: ActiveNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { unreadCount } = useNotifications();

  const rfpSectionCollapsed = useSidebarSectionsStore((s) => s.isCollapsed('rfp'));
  const inboxSectionCollapsed = useSidebarSectionsStore((s) => s.isCollapsed('inbox'));
  const settingsSectionCollapsed = useSidebarSectionsStore((s) => s.isCollapsed('settings'));

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  function isStatusActive(basePath: string, status: string) {
    return pathname === basePath && searchParams.get('status') === status;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Ungrouped top items */}
      <Link
        href="/home"
        aria-current={isActive('/home') ? 'page' : undefined}
        onClick={onNavigate}
        className={cn(navItemBase, isActive('/home') ? navItemActive : navItemInactive)}
      >
        <HomeIcon size={18} />
        <span>홈</span>
      </Link>

      <Link
        href="/notifications"
        aria-current={isActive('/notifications') ? 'page' : undefined}
        onClick={onNavigate}
        className={cn(navItemBase, isActive('/notifications') ? navItemActive : navItemInactive)}
      >
        <BellIcon size={18} />
        <span>알림</span>
        {unreadCount > 0 && (
          <span
            data-testid="unread-badge"
            aria-label={`미읽음 ${unreadCount}건`}
            className="ml-auto inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--md-sys-color-warning)] px-1 text-[10px] font-medium text-white md-numeric"
          >
            {unreadCount}
          </span>
        )}
      </Link>

      {/* Workspace-specific section */}
      {workspaceType === 'buyer' && (
        <div className="mt-3">
          <SectionHeader label="RFP" sectionId="rfp" />
          {!rfpSectionCollapsed && (
            <div className="mt-0.5 flex flex-col gap-0.5">
              {(
                [
                  { status: 'draft', label: '작성중' },
                  { status: 'active', label: '진행중' },
                  { status: 'closed', label: '마감' },
                  { status: 'awarded', label: '계약완료' },
                ] as const
              ).map(({ status, label }) => {
                const active = isStatusActive('/rfp', status);
                return (
                  <Link
                    key={status}
                    href={`/rfp?status=${status}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={cn(subItemBase, active ? subItemActive : subItemInactive)}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {workspaceType === 'pg' && (
        <div className="mt-3">
          <SectionHeader label="받은 RFP" sectionId="inbox" />
          {!inboxSectionCollapsed && (
            <div className="mt-0.5 flex flex-col gap-0.5">
              {(
                [
                  { status: 'new', label: '신규' },
                  { status: 'draft', label: '작성중' },
                  { status: 'submitted', label: '제출완료' },
                  { status: 'closed', label: '마감' },
                ] as const
              ).map(({ status, label }) => {
                const active = isStatusActive('/inbox', status);
                return (
                  <Link
                    key={status}
                    href={`/inbox?status=${status}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={cn(subItemBase, active ? subItemActive : subItemInactive)}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Settings section — both workspaces */}
      <div className="mt-3">
        <SectionHeader label="설정" sectionId="settings" />
        {!settingsSectionCollapsed && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            <Link
              href="/settings/profile"
              aria-current={isActive('/settings/profile') ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(subItemBase, isActive('/settings/profile') ? subItemActive : subItemInactive)}
            >
              프로필
            </Link>
            <Link
              href="/settings/members"
              aria-current={isActive('/settings/members') ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(subItemBase, isActive('/settings/members') ? subItemActive : subItemInactive)}
            >
              멤버
            </Link>
            {/* 알림 설정 항목 제거 — 별도 알림 설정 UI가 생기면 다시 추가. 알림 피드는 상단 '알림' 항목(/notifications). */}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main sidebar body ──────────────────────────────────────────────────────

function SidebarBody({ user, workspaceType, workspaces, current, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const router = useRouter();
  const { openCommandPalette } = useUIStore();
  const isMac = useIsMac();
  const searchShortcut = formatModifierShortcut('K', isMac);

  async function handleLogout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="flex h-full flex-col gap-1 px-2.5 py-3">
      {/* Top row: workspace switcher + search icon + compose icon (buyer only) */}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher current={current} workspaces={workspaces} />
        </div>
        <IconButton
          label={`검색 (${searchShortcut})`}
          size="sm"
          onClick={() => { openCommandPalette(); onNavigate?.(); }}
        >
          <SearchIcon size={16} />
        </IconButton>
        {workspaceType === 'buyer' && (
          <Link
            href="/rfp/new"
            aria-label="새 RFP 작성"
            onClick={onNavigate}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] [&_svg]:size-4"
          >
            <ComposeIcon size={16} />
          </Link>
        )}
      </div>

      {/* Navigation — wrapped in Suspense for useSearchParams */}
      <nav aria-label="기본 내비게이션" className="mt-2 flex flex-col gap-0.5">
        <Suspense
          fallback={
            <div className="flex flex-col gap-0.5">
              <div className={cn(navItemBase, navItemInactive)}>
                <HomeIcon size={18} />
                <span>홈</span>
              </div>
              <div className={cn(navItemBase, navItemInactive)}>
                <BellIcon size={18} />
                <span>알림</span>
              </div>
            </div>
          }
        >
          <ActiveNav
            user={user}
            workspaceType={workspaceType}
            workspaces={workspaces}
            current={current}
            onNavigate={onNavigate}
          />
        </Suspense>
      </nav>

      {/* Footer — theme + user dropdown (bell removed; 알림 is now a top nav item) */}
      <div className="mt-auto flex items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] pt-2">
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

// ── exported Sidebar component ─────────────────────────────────────────────

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
