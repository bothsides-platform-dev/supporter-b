'use client';

import { memo } from 'react';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import type { Role } from '@/lib/types/user';
import { roleLabel } from './members-panel-utils';

export type PendingInvite = { email: string; createdAt: string; role: Role };

type Props = {
  invite: PendingInvite;
  index: number;
  isAdmin: boolean;
  isMutating: boolean;
  onResend: (email: string) => void;
  onCancelClick: (email: string) => void;
};

function PendingInviteRowImpl({
  invite: p,
  index: i,
  isAdmin,
  isMutating,
  onResend,
  onCancelClick,
}: Props) {
  return (
    <div className="py-3 flex items-center gap-4">
      <span className="md-numeric text-[11px] text-[var(--md-sys-color-on-surface-variant)] w-8">
        {String(i + 1).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <span className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface)]">
          {p.email}
        </span>
      </div>
      <Chip label={roleLabel[p.role]} color={p.role === 'admin' ? 'primary' : 'surface'} />
      <Chip label="대기중" color="warning" />
      {isAdmin && (
        <div className="flex items-center gap-1">
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
  );
}

export const PendingInviteRow = memo(PendingInviteRowImpl);
