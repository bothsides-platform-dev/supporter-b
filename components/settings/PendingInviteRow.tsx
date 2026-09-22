'use client';

import { memo } from 'react';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { LocalDate } from '@/components/primitives/LocalTime';
import type { Role } from '@/lib/types/user';
import { roleLabel } from './members-panel-utils';

export type PendingInvite = { email: string; createdAt: string | null; role: Role };

type Props = {
  invite: PendingInvite;
  isAdmin: boolean;
  isMutating: boolean;
  onResend: (email: string) => void;
  onCancelClick: (email: string) => void;
};

function PendingInviteRowImpl({
  invite: p,
  isAdmin,
  isMutating,
  onResend,
  onCancelClick,
}: Props) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <span className="md-numeric block text-[14px] text-[var(--md-sys-color-on-surface)] [overflow-wrap:anywhere]">
          {p.email}
        </span>
        <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {p.createdAt ? <>초대한 날 <span className="md-numeric"><LocalDate iso={p.createdAt} /></span></> : '초대 완료'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <Chip label={roleLabel[p.role]} color={p.role === 'admin' ? 'primary' : 'surface'} />
        <Chip label="대기 중" color="warning" />
        {isAdmin && (
        <div className="flex flex-wrap items-center gap-1 sm:ml-2">
          <Button
            type="button"
            variant="text"
            size="sm"
            disabled={isMutating}
            onClick={() => onResend(p.email)}
          >
            재발송
          </Button>
          <Button
            type="button"
            variant="text"
            size="sm"
            color="error"
            disabled={isMutating}
            onClick={() => onCancelClick(p.email)}
          >
            취소
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}

export const PendingInviteRow = memo(PendingInviteRowImpl);
