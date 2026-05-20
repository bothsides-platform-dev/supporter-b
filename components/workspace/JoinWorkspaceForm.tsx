'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { extractWorkspaceInviteToken } from './extract-token';

// Join an existing workspace from inside the app (switcher → "초대 링크로 합류").
// The user pastes the invite link/token they received; we route to the existing
// accept flow (/invite/workspace/[token]) which validates email + membership and
// switches the active workspace into the joined one.
export function JoinWorkspaceForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const token = extractWorkspaceInviteToken(value);

  const handleSubmit = () => {
    if (!token) {
      setError('유효한 초대 링크 또는 토큰을 입력해주세요.');
      return;
    }
    router.push(`/invite/workspace/${token}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-4 max-w-[420px]"
    >
      <div className="space-y-2">
        <label
          htmlFor="invite-token"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
        >
          초대 링크 또는 토큰
        </label>
        <input
          id="invite-token"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError('');
          }}
          placeholder="https://…/invite/workspace/…"
          className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-1 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={!token}>
        합류하기
      </Button>
    </form>
  );
}
