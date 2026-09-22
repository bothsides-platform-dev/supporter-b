'use client';

import { useId, useState } from 'react';
import { Label } from '@/components/primitives/Label';
import { Button } from '@/components/primitives/Button';
import { Select } from '@/components/primitives/Select';
import type { Role } from '@/lib/types/user';
import { ROLE_OPTIONS, isValidInviteEmail, mutationErrorMessage } from './members-panel-utils';
import { Divider } from '@/components/primitives/Divider';

type InviteResult = { ok: true } | { ok: false; error: string };

type Props = {
  isPending: boolean;
  /** 초대 실행. 성공하면 폼을 초기화한다. */
  onInvite: (input: { email: string; role: Role }) => Promise<InviteResult>;
};

export function InviteMemberForm({ isPending, onInvite }: Props) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const emailId = `${id}-email`;
  const errorId = `${id}-error`;
  const roleId = `${id}-role`;

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!isValidInviteEmail(email)) {
      setError('이메일 주소를 확인해 주세요.');
      return;
    }

    const role = inviteRole;
    void onInvite({ email, role }).then((result) => {
      if (!result.ok) {
        if (result.error === 'ALREADY_INVITED') {
          setError('이미 초대 대기 중인 이메일이에요. 아래 목록에서 확인해 주세요.');
        } else if (result.error === 'FORBIDDEN_NOT_ADMIN') {
          setError('초대 권한이 없어요. 워크스페이스 관리자에게 요청해 주세요.');
        } else if (result.error === 'WORKSPACE_CHANGED') {
          setError(mutationErrorMessage(result.error));
        } else {
          setError('초대하지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
        return;
      }
      setInviteEmail('');
      setInviteRole('member');
    });
  };

  return (
    <section className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4">
      <div className="flex items-center gap-3 mb-4">
        <Label size="md" muted={false}>멤버 초대</Label>
        <Divider />
      </div>
      <form onSubmit={handleInvite} className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label as="label" htmlFor={emailId} size="md" muted={false}>이메일</Label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              value={inviteEmail}
              disabled={isPending}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setError(null);
              }}
              placeholder="member@company.com"
              className="md-numeric h-11 w-full rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 text-[14px] text-[var(--md-sys-color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 disabled:opacity-50 md:h-8"
            />
          </div>
          <div className="space-y-1">
            <Label as="label" htmlFor={roleId} size="md" muted={false}>역할</Label>
            <Select
              id={roleId}
              options={ROLE_OPTIONS}
              value={inviteRole}
              onChange={(v) => setInviteRole(v as Role)}
            />
          </div>
          <Button
            type="submit"
            disabled={!inviteEmail.trim() || isPending}
            className="h-11 md:ml-4 md:h-8"
          >
            {isPending ? '보내는 중…' : '초대 보내기'}
          </Button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">
            {error}
          </p>
        )}
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          초대 메일을 보내요. 상대방이 수락하면 멤버 목록에 표시돼요.
        </p>
      </form>
    </section>
  );
}
