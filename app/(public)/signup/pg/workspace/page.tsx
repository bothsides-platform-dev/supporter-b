'use client';

import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { signupCompleteAction } from '@/lib/server/actions/auth';
import {
  clearSignupDraft,
  readSignupDraft,
} from '@/lib/auth/signup-storage';

export default function PgWorkspacePage() {
  const router = useRouter();
  const [wsName, setWsName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const draft = readSignupDraft();
  const isInvite = !!draft.inviteToken;
  const current = isInvite ? 3 : 4;
  const total = isInvite ? 3 : 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = readSignupDraft();
    if (!d.email || !d.password || !d.name || !d.phone || !d.phoneVerificationId) {
      setError('세션이 만료되었습니다. 처음부터 다시 시도해주세요.');
      return;
    }
    if (!wsName.trim()) {
      setError('워크스페이스 이름을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');

    const r = await signupCompleteAction({
      email: d.email,
      name: d.name,
      password: d.password,
      phone: d.phone,
      phoneVerificationId: d.phoneVerificationId,
      wsKind: 'pg',
      wsName: wsName.trim(),
    });

    if (!r.ok) {
      setSubmitting(false);
      setError(`가입을 완료하지 못했습니다. (${r.error})`);
      return;
    }

    const signInResult = await signIn('credentials', {
      email: r.email,
      password: r.password,
      redirect: false,
    });

    clearSignupDraft();

    if (signInResult && signInResult.error) {
      setSubmitting(false);
      setError('로그인에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.');
      router.push('/login');
      return;
    }

    router.push(r.redirectTo);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)] mb-3">
          {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </p>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          워크스페이스를 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          PG 워크스페이스 이름을 입력해주세요. 동료를 나중에 초대할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label
            htmlFor="ws-name"
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            워크스페이스 이름
          </label>
          <input
            id="ws-name"
            type="text"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="예: 서포터 B 페이 영업팀"
            disabled={submitting}
            className="w-full px-4 py-3 text-[14px] bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline)] rounded-md placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)] disabled:opacity-50"
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

        <button
          type="submit"
          disabled={submitting || !wsName.trim()}
          className="w-full py-3 text-[14px] font-[600] tracking-[-0.01em] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {submitting ? 'LOADING…' : '워크스페이스 만들기'}
        </button>
      </form>
    </div>
  );
}
