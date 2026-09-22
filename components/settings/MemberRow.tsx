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
    <div className="flex items-start gap-3 py-3 transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] sm:items-center">
      <UserProfileCard name={m.name} color="primary" size="md" userId={m.id} avatarUpdatedAt={m.avatarUpdatedAt} />
      <div className="min-w-0 flex-1 space-y-2 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
            {m.name}
            {isSelf && (
              <span className="ml-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                (나)
              </span>
            )}
          </p>
          <span className="md-numeric block text-[13px] text-[var(--md-sys-color-on-surface-variant)] [overflow-wrap:anywhere]">
            {m.email}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:shrink-0">
          <Chip label={roleLabel[m.role]} color={m.role === 'admin' ? 'primary' : 'surface'} />
          <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            최근 접속 {m.lastSeenAt ? <span className="md-numeric"><LocalDate iso={m.lastSeenAt} /></span> : '· 기록 없음'}
          </span>
        </div>
      </div>

      {isAdmin && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${m.name} 관리`}
            disabled={isMutating}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 disabled:opacity-[0.38] disabled:cursor-not-allowed disabled:pointer-events-none"
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
      )}
    </div>
  );
}

export const MemberRow = memo(MemberRowImpl);
