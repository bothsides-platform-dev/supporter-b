'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/primitives/Button';
import { AgreementCheckboxes } from '@/components/auth/AgreementCheckboxes';
import { PasswordField } from '@/components/auth/PasswordField';
import { SignupEmailGuide } from '@/components/auth/SignupEmailGuide';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';
import { getSignupConsentDocuments } from '@/lib/auth/signup-documents';
import { validateSignupConsent } from '@/lib/auth/signup-consent';
import {
  isPasswordValid,
  validatePasswordConfirm,
} from '@/lib/auth/password-validation';
import { checkEmailAvailableAction } from '@/lib/server/actions/auth';
import { safeInternalNext } from '@/lib/auth/safe-next';
import { underlineInputBase, underlineInputBorder } from '@/components/forms/inputs';

type AgreementState = { terms: boolean; privacy: boolean; marketing: boolean };

function PgSignupEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewConsent = searchParams.get('consent') === 'review';
  const { setEmail, setWorkspaceType } = useSignupDraftStore();

  const [invite, setInvite] = useState({ token: '', workspaceName: '' });
  const isInvited = !!invite.token;
  const inviteWorkspaceName = invite.workspaceName;

  const documents = getSignupConsentDocuments();
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agreements, setAgreements] = useState<AgreementState>({
    terms: false,
    privacy: false,
    marketing: false,
  });
  useEffect(() => {
    const d = readSignupDraft();
    if (d.workspaceType !== 'pg' && !d.wsInviteToken) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 마운트 뒤 sessionStorage에서 1회 복원 */
    if (d.email) setEmailInput(d.email);
    setInvite({ token: d.wsInviteToken ?? '', workspaceName: d.inviteWorkspaceName ?? '' });
    const restored = validateSignupConsent(d.consent);
    if (restored.ok && !reviewConsent) {
      const { terms, privacy, marketing } = restored.consent;
      setAgreements({ terms, privacy, marketing });
    } else {
      setAgreements({ terms: false, privacy: false, marketing: false });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [reviewConsent]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [masterEmail, setMasterEmail] = useState(false);
  const [emailCheckError, setEmailCheckError] = useState('');

  const confirmError =
    passwordConfirm.length > 0
      ? validatePasswordConfirm(password, passwordConfirm)
      : attemptedSubmit
        ? '비밀번호 확인을 입력해요.'
        : null;

  const canSubmit =
    documents !== null &&
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
    setEmailCheckError('');
    try {
      const check = await checkEmailAvailableAction({ email });
      if (!check.ok && check.error === 'EMAIL_TAKEN') {
        setEmailTaken(true);
      } else if (!check.ok && check.error === 'MASTER_EMAIL') {
        setMasterEmail(true);
      }
    } catch {
      setEmailCheckError('이메일을 확인하지 못했어요. 잠시 후 다시 시도해요.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    if (
      !canSubmit ||
      validatePasswordConfirm(password, passwordConfirm) !== null ||
      submitting ||
      !documents
    ) return;
    setEmailTaken(false);
    setMasterEmail(false);
    setEmailCheckError('');

    setSubmitting(true);
    const email = emailInput.trim().toLowerCase();

    try {
      const check = await checkEmailAvailableAction({ email });
      if (!check.ok && check.error === 'EMAIL_TAKEN') {
        if (isInvited) {
          // 초대받은 이메일이 이미 가입됨 → 로그인 후 authed path로 합류.
          router.replace(`/login?next=${encodeURIComponent(`/invite/workspace/${invite.token}`)}&email=${encodeURIComponent(email)}`);
          return;
        }
        setEmailTaken(true);
        return;
      }
      if (!check.ok && check.error === 'MASTER_EMAIL') {
        // 운영자/마스터 이메일은 가입 불가(Google OAuth 전용).
        setMasterEmail(true);
        return;
      }

      setEmail(email);
      setWorkspaceType('pg');

      const nextParam = safeInternalNext(searchParams.get('next'));
      writeSignupDraft({
        ...readSignupDraft(),
        email,
        password,
        consent: {
          ...agreements,
          termsVersion: documents.terms.version,
          privacyVersion: documents.privacy.version,
          marketingVersion: documents.marketing.version,
        },
        workspaceType: 'pg',
        // step-1이 next의 단일 출처: 현재 진입 URL 기준으로 덮어쓴다(이전 세션 잔여값 제거).
        next: nextParam ?? undefined,
      });

      // 초대 경로: workspace 단계 건너뜀 (wsName/bizNo 불필요)
      router.push(isInvited ? '/signup/pg/profile' : '/signup/pg/workspace');
    } catch {
      setEmailCheckError('이메일을 확인하지 못했어요. 잠시 후 다시 시도해요.');
    } finally {
      setSubmitting(false);
    }
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
            onChange={(e) => { if (!isInvited) { setEmailInput(e.target.value); setEmailTaken(false); setMasterEmail(false); setEmailCheckError(''); } }}
            onBlur={handleEmailBlur}
            readOnly={isInvited}
            autoComplete="email"
            placeholder="your@pgcompany.com"
            className={[
              underlineInputBase,
              isInvited
                ? 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] cursor-default select-all'
                : underlineInputBorder,
            ].join(' ')}
          />
          {emailTaken && !isInvited && (
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
          {masterEmail && !isInvited && (
            <p role="alert" className="text-xs text-[var(--md-sys-color-error)] mt-1">
              이 이메일로는 가입할 수 없어요. 다른 이메일을 사용해 주세요.
            </p>
          )}
          {emailCheckError && (
            <p role="alert" className="text-[13px] text-[var(--md-sys-color-error)] mt-1">
              {emailCheckError}
            </p>
          )}
          <SignupEmailGuide email={emailInput} hidden={emailTaken || masterEmail || isInvited || !!emailCheckError} />
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

        {reviewConsent && documents && (
          <p role="alert" className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            가입 동의 내용을 다시 확인해 주세요. 아래 문서를 확인하고 동의하면 계속할 수 있어요.
          </p>
        )}
        <AgreementCheckboxes value={agreements} onChange={setAgreements} documents={documents} disabled={submitting} />

        <Button type="submit" fullWidth size="lg" disabled={submitting || !documents}>
          {submitting ? '처리 중…' : '다음'}
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
          불러오는 중이에요…
        </p>
      }
    >
      <PgSignupEmailForm />
    </Suspense>
  );
}
