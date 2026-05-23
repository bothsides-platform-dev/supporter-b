'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { ComposeIcon } from '@/components/icons';
import { Logo } from '@/components/primitives/Logo';
import { IconButton } from '@/components/primitives/IconButton';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { UserMenu } from '@/components/shell/UserMenu';
import { WorkspaceSwitcher } from '@/components/shell/WorkspaceSwitcher';
import { NavItem } from '@/components/shell/sidebar/NavItem';
import { SidebarSection } from '@/components/shell/sidebar/SidebarSection';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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

// ── active-state-aware nav (uses useSearchParams via SidebarSection — keep in Suspense) ──

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
                className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--md-sys-color-warning)] px-1 text-[10px] font-medium text-white md-numeric"
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

// ── sidebar body (shared by desktop rail and mobile drawer) ─────────────────

function SidebarBody({
  user,
  workspaceType,
  workspaces,
  current,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-1 px-2.5 py-3">
      {/* Top row: workspace switcher + compose (buyer only). Search lives in the header now. */}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher current={current} workspaces={workspaces} />
        </div>
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

      <nav aria-label="기본 내비게이션" className="mt-2 flex flex-col gap-0.5">
        <Suspense fallback={null}>
          <SidebarNav workspaceType={workspaceType} onNavigate={onNavigate} />
        </Suspense>
      </nav>

      {/* Footer — theme toggle. The user menu (settings/logout) lives in the
          header on desktop; mirror it here on mobile, where the header is hidden. */}
      <div className="mt-auto flex items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] pt-2">
        <ThemeToggle />
        <div className="ml-auto md:hidden">
          <UserMenu
            user={{ name: user.name, email: user.email }}
            workspaceType={workspaceType}
          />
        </div>
      </div>
    </div>
  );
}

// ── exported Sidebar ────────────────────────────────────────────────────────

export function Sidebar(props: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const chordMap = useMemo(
    () => getChordMap(props.workspaceType),
    [props.workspaceType],
  );
  useGoToShortcut(chordMap);

  return (
    <TooltipProvider delay={300}>
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
    </TooltipProvider>
  );
}
