'use client';

import { useRouter } from 'next/navigation';
import { http } from '@/lib/http';
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

type UserMenuProps = {
  user: { name: string; email: string };
  workspaceType: WorkspaceType;
  className?: string;
};

/**
 * UserMenu — avatar dropdown with account identity + 설정/로그아웃.
 *
 * Shared by the desktop Header and the mobile sidebar drawer. The header is
 * desktop-only, so the sidebar renders this with `md:hidden` to keep logout and
 * identity reachable on mobile (where the header is gone).
 */
export function UserMenu({ user, workspaceType, className }: UserMenuProps) {
  const router = useRouter();

  async function handleLogout() {
    await http.post('/logout');
    window.location.assign('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="사용자 메뉴"
        className={cn(
          'flex items-center rounded-[var(--md-sys-shape-small)] p-0.5 outline-none transition-colors hover:bg-[var(--md-sys-color-surface-container)]',
          className,
        )}
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
