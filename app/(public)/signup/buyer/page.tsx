'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/primitives/Button';
import { AgreementCheckboxes } from '@/components/auth/AgreementCheckboxes';
import { PasswordField } from '@/components/auth/PasswordField';
import { SignupEmailGuide } from '@/components/auth/SignupEmailGuide';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';
import {
  isPasswordValid,
  validatePasswordConfirm,
} from '@/lib/auth/password-validation';
import { checkEmailAvailableAction } from '@/lib/server/actions/auth';
import { safeInternalNext } from '@/lib/auth/safe-next';
import { underlineInputClass } from '@/components/forms/inputs';

type AgreementState = { terms: boolean; privacy: boolean; marketing: boolean };

function BuyerSignupEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setEmail, setAgreedAt, setWorkspaceType } = useSignupDraftStore();

  // 2단계에서 뒤로 오면 draft 로 1단계를 다시 채운다 — 없으면 이메일·비밀번호·동의를
  // 처음부터 다시 입력해야 한다. 폼은 Suspense(useSearchParams) 아래라 서버에서
  // 렌더되지 않으므로 초기값에서 sessionStorage 를 읽어도 하이드레이션이 어긋나지 않는다.
  const [restored] = useState(() => {
    const d = readSignupDraft();
    return d.workspaceType === 'buyer' ? d : {};
  });
  const [emailInput, setEmailInput] = useState(restored.email ?? '');
  const [password, setPassword] = useState(restored.password ?? '');
  const [passwordConfirm, setPasswordConfirm] = useState(restored.password ?? '');
  const [agreements, setAgreements] = useState<AgreementState>({
    terms: !!restored.agreedAt,
    privacy: !!restored.agreedAt,
    marketing: false,
  });
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [masterEmail, setMasterEmail] = useState(false);

  const confirmError =
    passwordConfirm.length > 0
      ? validatePasswordConfirm(password, passwordConfirm)
      : attemptedSubmit
        ? '비밀번호 확인을 입력해주세요.'
        : null;

  const canSubmit =
    emailInput.trim() !== '' &&
    !emailTaken &&
    !masterEmail &&
    agreements.terms &&
    agreements.privacy &&
    isPasswordValid(password) &&
    !confirmError;

  const handleEmailBlur = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const check = await checkEmailAvailableAction({ email });
    if (!check.ok && check.error === 'EMAIL_TAKEN') {
      setEmailTaken(true);
    } else if (!check.ok && check.error === 'MASTER_EMAIL') {
      setMasterEmail(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    if (!canSubmit || submitting) return;
    setEmailTaken(false);
    setMasterEmail(false);

    setSubmitting(true);
    const email = emailInput.trim().toLowerCase();

    const check = await checkEmailAvailableAction({ email });
    if (!check.ok && check.error === 'EMAIL_TAKEN') {
      setEmailTaken(true);
      setSubmitting(false);
      return;
    }
    if (!check.ok && check.error === 'MASTER_EMAIL') {
      // 운영자/마스터 이메일은 가입 불가(Google OAuth 전용).
      setMasterEmail(true);
      setSubmitting(false);
      return;
    }

    const agreedAt = new Date().toISOString();
    setEmail(email);
    setAgreedAt(agreedAt);
    setWorkspaceType('buyer');

    const draft = readSignupDraft();
    const nextParam = safeInternalNext(searchParams.get('next'));
    writeSignupDraft({
      ...draft,
      email,
      password,
      agreedAt,
      workspaceType: 'buyer',
      // step-1이 next의 단일 출처: 현재 진입 URL 기준으로 덮어쓴다(이전 세션 잔여값 제거).
      next: nextParam ?? undefined,
    });

    router.push('/signup/buyer/workspace');
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={1} total={3} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          구매사 계정을 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          이메일과 비밀번호를 입력해요.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="md-label-small text-[var(--md-sys-color-on-surface-variant)]"
          >
            이메일
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={emailInput}
            onChange={(e) => { setEmailInput(e.target.value); setEmailTaken(false); setMasterEmail(false); }}
            onBlur={handleEmailBlur}
            autoComplete="email"
            placeholder="your@company.com"
            className={underlineInputClass}
          />
          {emailTaken && (
            <p role="alert" className="text-xs text-[var(--md-sys-color-error)] mt-1">
              이미 가입된 이메일입니다.{' '}
              <Link
                href={`/login?email=${encodeURIComponent(emailInput.trim().toLowerCase())}`}
                className="underline"
              >
                로그인
              </Link>
              하시겠어요?
            </p>
          )}
          {masterEmail && (
            <p role="alert" className="text-xs text-[var(--md-sys-color-error)] mt-1">
              이 이메일로는 가입할 수 없어요. 다른 이메일을 사용해 주세요.
            </p>
          )}
          <SignupEmailGuide email={emailInput} hidden={emailTaken || masterEmail} />
        </div>

        <PasswordField
          label="비밀번호"
          value={password}
          onChange={setPassword}
          showStrength
          error={attemptedSubmit && !password ? '비밀번호를 입력해주세요.' : undefined}
        />
        <PasswordField
          label="비밀번호 확인"
          name="passwordConfirm"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          autoComplete="new-password"
          error={confirmError ?? undefined}
        />

        <AgreementCheckboxes value={agreements} onChange={setAgreements} />

        <Button type="submit" fullWidth size="lg" disabled={submitting}>
          {submitting ? '처리 중…' : '다음'}
        </Button>
      </form>

      <div className="text-center space-y-2">
        <Link
          href="/login"
          className="block md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          이미 계정이 있어요? 로그인 →
        </Link>
      </div>
    </div>
  );
}

export default function BuyerSignupEmailPage() {
  return (
    <Suspense
      fallback={
        <p className="md-label-medium text-center">
          불러오는 중이에요…
        </p>
      }
    >
      <BuyerSignupEmailForm />
    </Suspense>
  );
}
