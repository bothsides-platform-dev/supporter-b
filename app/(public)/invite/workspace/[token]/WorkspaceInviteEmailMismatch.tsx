'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Mail } from 'lucide-react';

type Props = {
  inviteEmail: string;
  token: string;
};

export function WorkspaceInviteEmailMismatch({ inviteEmail, token }: Props) {
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    setLoading(true);
    try {
      await signOut({ redirect: true, callbackUrl: `/invite/workspace/${token}` });
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="py-12 max-w-[420px] mx-auto text-center space-y-6">
      <div className="flex justify-center">
        <Mail
          size={32}
          strokeWidth={1.4}
          className="text-[var(--md-sys-color-on-surface-variant)]"
        />
      </div>

      <div className="space-y-2">
        <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
          다른 이메일로 초대를 받으셨어요
        </p>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          이 초대는{' '}
          <span className="text-[var(--md-sys-color-on-surface)] font-medium">
            {inviteEmail}
          </span>
          로 전송됐어요.
          <br />
          지금 로그인한 계정으로는 수락할 수 없어요.
        </p>
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={loading}
        className="inline-flex items-center justify-center h-9 px-4 rounded-[6px] text-[13px] font-medium bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'LOADING…' : '로그아웃하고 계속하기'}
      </button>
    </div>
  );
}
