'use client';

import { memo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { josa } from 'es-hangul';
import { UserProfileCard } from '@/components/profile/UserProfileCard';
import { Chip } from '@/components/primitives/Chip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LocalDate } from '@/components/primitives/LocalTime';
import type { Role, User } from '@/lib/types/user';
import { roleLabel } from './members-panel-utils';

type Props = {
  member: User;
  isSelf: boolean;
  isAdmin: boolean;
  isMutating: boolean;
  onRoleChange: (member: User, role: Role) => void;
  onRemoveClick: (member: User) => void;
};

function MemberRowImpl({
  member: m,
  isSelf,
  isAdmin,
  isMutating,
  onRoleChange,
  onRemoveClick,
}: Props) {
  const oppositeRole: Role = m.role === 'admin' ? 'member' : 'admin';
  const oppositeRoleLabel = roleLabel[oppositeRole];

  return (
    <div className="py-4 flex items-center gap-4 hover:bg-[var(--md-sys-color-surface-container-high)] -mx-4 px-4 transition-colors">
      <UserProfileCard name={m.name} color="primary" size="md" userId={m.id} avatarUpdatedAt={m.avatarUpdatedAt} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
          {m.name}
          {isSelf && (
            <span className="ml-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              (나)
            </span>
          )}
        </p>
        <span className="font-mono text-[11px] text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
          {m.email}
        </span>
      </div>
      <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)] hidden md:inline">
        {m.lastSeenAt ? <LocalDate iso={m.lastSeenAt} /> : '—'}
      </span>

      {isAdmin ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${m.name} 관리`}
            disabled={isMutating}
            className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 disabled:opacity-[0.38] disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
            <DropdownMenuItem
              disabled={isSelf || isMutating}
              onClick={() => onRoleChange(m, oppositeRole)}
            >
              {josa(oppositeRoleLabel, '으로/로')} 변경
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isSelf || isMutating}
              onClick={() => onRemoveClick(m)}
            >
              내보내기
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Chip label={roleLabel[m.role]} color={m.role === 'admin' ? 'primary' : 'surface'} />
      )}
    </div>
  );
}

export const MemberRow = memo(MemberRowImpl);
