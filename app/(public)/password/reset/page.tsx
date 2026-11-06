'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/primitives/Button';
import { PasswordField } from '@/components/auth/PasswordField';
import { CheckSvg } from '@/components/auth/EnvelopeSvg';
import { passwordResetAction } from '@/lib/server/actions/auth';
import {
  getPasswordConfirmError,
  getPasswordError,
} from '@/lib/auth/password-validation';
import { useFocusFirstInvalid } from '@/lib/a11y/use-focus-first-invalid';

function ResetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { containerRef: formRef, requestFocus } = useFocusFirstInvalid<HTMLFormElement>();

  if (!token) {
    return (
      <p className="text-[13px] text-[var(--md-sys-color-error)] text-center">
        잘못된 링크입니다.
      </p>
    );
  }

  const passwordError = getPasswordError(password, {
    outcome: 'change',
    confirmFilled: passwordConfirm !== '',
  });
  const confirmError = getPasswordConfirmError(password, passwordConfirm);
  const canSubmit = !passwordError && !confirmError;
  // 가입 1단계와 같은 규칙: 확인 칸 불일치는 입력 중에 바로, 나머지는 막힌 뒤에.
  const shownPasswordError = attempted ? passwordError : null;
  const shownConfirmError = attempted || passwordConfirm ? confirmError : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setAttempted(true);
    if (!canSubmit) {
      requestFocus();
      return;
    }
    setServerError('');
    setSubmitting(true);
    const r = await passwordResetAction({ rawToken: token, password });
    if (!r.ok) {
      setSubmitting(false);
      // Server-side policy enforcement uses the same rule set as the client
      // guard above, so WEAK_PASSWORD here is the rare bypass case (direct
      // API call). Token failures stay generic to avoid token-state leakage.
      setServerError(
        r.error === 'WEAK_PASSWORD'
          ? '비밀번호 조건을 모두 채우면 바꿀 수 있어요.'
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
        <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">불러오는 중이에요…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">새 비밀번호</h2>
      </div>
      <form ref={formRef} className="space-y-6" onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="새 비밀번호"
          value={password}
          onChange={setPassword}
          showStrength
          showRuleErrors={attempted}
          error={shownPasswordError ?? undefined}
        />
        <PasswordField
          label="비밀번호 확인"
          name="passwordConfirm"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          autoComplete="new-password"
          error={shownConfirmError ?? undefined}
        />
        {serverError && (
          <p role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">
            {serverError}
          </p>
        )}
        <Button type="submit" fullWidth size="lg" disabled={submitting} dimmed={!canSubmit}>
          {submitting ? '처리 중…' : '변경하기'}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="md-label-medium text-center">불러오는 중이에요…</p>}>
      <ResetContent />
    </Suspense>
  );
}
