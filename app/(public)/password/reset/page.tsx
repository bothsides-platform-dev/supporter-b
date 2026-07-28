'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/primitives/Button';
import { PasswordField } from '@/components/auth/PasswordField';
import { CheckSvg } from '@/components/auth/EnvelopeSvg';
import { passwordResetAction } from '@/lib/server/actions/auth';
import { isPasswordValid } from '@/lib/auth/password-validation';

function ResetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <p className="text-[13px] text-[var(--md-sys-color-error)] text-center">
        잘못된 링크입니다.
      </p>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(password)) {
      setError('비밀번호 규칙을 모두 충족해야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setError('');
    setSubmitting(true);
    const r = await passwordResetAction({ rawToken: token, password });
    if (!r.ok) {
      setSubmitting(false);
      // Server-side policy enforcement uses the same rule set as the client
      // guard above, so WEAK_PASSWORD here is the rare bypass case (direct
      // API call). Token failures stay generic to avoid token-state leakage.
      setError(
        r.error === 'WEAK_PASSWORD'
          ? '비밀번호 규칙을 모두 충족해야 합니다.'
          : '재설정 링크가 만료되었거나 유효하지 않습니다.',
      );
      return;
    }
    // Auto-login per advisor block C — server action returns the plaintext
    // back; we sign in client-side.
    const signInResult = await signIn('credentials', {
      email: r.email,
      password: r.password,
      redirect: false,
    });
    setSubmitting(false);
    if (signInResult && signInResult.error) {
      // Password did update — direct user to log in manually.
      router.push('/login');
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/home'), 1200);
  };

  if (done) {
    return (
      <div className="space-y-8 text-center">
        <div className="flex justify-center text-[var(--md-sys-color-tertiary)]"><CheckSvg size={64} /></div>
        <p className="text-[14px] text-[var(--md-sys-color-on-surface)]">비밀번호가 변경되었습니다.</p>
        <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">LOADING…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">새 비밀번호</h2>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <PasswordField label="새 비밀번호" value={password} onChange={setPassword} showStrength />
        <PasswordField label="비밀번호 확인" name="passwordConfirm" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" error={error} />
        <Button type="submit" fullWidth size="lg" disabled={submitting || !password || !passwordConfirm}>
          {submitting ? 'LOADING…' : '변경하기'}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="md-label-medium text-center">LOADING…</p>}>
      <ResetContent />
    </Suspense>
  );
}
