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

type AgreementState = { terms: boolean; privacy: boolean; marketing: boolean };

function PgSignupEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setEmail, setAgreedAt, setWorkspaceType } = useSignupDraftStore();

  // 초대 경로 여부를 draft에서 읽는다 (sessionStorage, 서버사이드에서 읽을 수 없음)
  const draft = readSignupDraft();
  const isInvited = !!draft.wsInviteToken;
  const inviteEmail = draft.email ?? '';
  const inviteWorkspaceName = draft.inviteWorkspaceName ?? '';

  const [emailInput, setEmailInput] = useState(isInvited ? inviteEmail : '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agreements, setAgreements] = useState<AgreementState>({
    terms: false,
    privacy: false,
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
        ? '비밀번호 확인을 입력해요.'
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
    if (isInvited) return;
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
      if (isInvited) {
        // 초대받은 이메일이 이미 가입됨 → 로그인 후 authed path로 합류.
        // setSubmitting(false) 생략: 곧 navigate하므로 버튼 재활성화 불필요.
        router.replace(`/login?next=${encodeURIComponent(`/invite/workspace/${draft.wsInviteToken}`)}&email=${encodeURIComponent(email)}`);
        return;
      }
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
    setWorkspaceType('pg');

    const nextParam = safeInternalNext(searchParams.get('next'));
    writeSignupDraft({
      ...draft,
      email,
      password,
      agreedAt,
      workspaceType: 'pg',
      // step-1이 next의 단일 출처: 현재 진입 URL 기준으로 덮어쓴다(이전 세션 잔여값 제거).
      next: nextParam ?? undefined,
    });

    // 초대 경로: workspace 단계 건너뜀 (wsName/bizNo 불필요)
    router.push(isInvited ? '/signup/pg/profile' : '/signup/pg/workspace');
  };

  const stepperTotal = isInvited ? 2 : 3;

  return (
    <div className="space-y-6">
      <SignupStepper current={1} total={stepperTotal} />

      {/* 초대 맥락 안내 */}
      {isInvited && inviteWorkspaceName && (
        <div className="rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-variant)] px-4 py-3">
          <p className="md-label-small text-[var(--md-sys-color-primary)] mb-1">
            워크스페이스 초대
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            <span className="font-[600] text-[var(--md-sys-color-on-surface)]">{inviteWorkspaceName}</span>에 초대받았습니다.
            <br />계정을 만들고 팀에 합류하세요.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          {isInvited ? '계정을 만들어 합류해요' : 'PG사 계정을 만듭니다'}
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
            onChange={(e) => { if (!isInvited) { setEmailInput(e.target.value); setEmailTaken(false); setMasterEmail(false); } }}
            onBlur={handleEmailBlur}
            readOnly={isInvited}
            autoComplete="email"
            placeholder="your@pgcompany.com"
            className={[
              'block w-full bg-transparent border-0 border-b py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none transition-colors',
              isInvited
                ? 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] cursor-default select-all'
                : 'border-[var(--md-sys-color-outline)] focus:border-[var(--md-sys-color-on-surface)]',
            ].join(' ')}
          />
          {emailTaken && !isInvited && (
            <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)] mt-1">
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
          {masterEmail && !isInvited && (
            <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)] mt-1">
              이 이메일로는 가입할 수 없어요. 다른 이메일을 사용해 주세요.
            </p>
          )}
          <SignupEmailGuide email={emailInput} hidden={emailTaken || masterEmail || isInvited} />
        </div>

        <PasswordField
          label="비밀번호"
          value={password}
          onChange={setPassword}
          showStrength
          error={attemptedSubmit && !password ? '비밀번호를 입력해요.' : undefined}
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
          {submitting ? 'LOADING…' : '다음'}
        </Button>
      </form>

      {!isInvited && (
        <div className="text-center space-y-2">
          <Link
            href="/login"
            className="block md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            이미 계정이 있어요? 로그인 →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function PgSignupEmailPage() {
  return (
    <Suspense
      fallback={
        <p className="md-label-medium text-center">
          LOADING…
        </p>
      }
    >
      <PgSignupEmailForm />
    </Suspense>
  );
}
