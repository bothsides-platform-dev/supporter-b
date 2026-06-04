'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { PhoneVerificationField } from '@/components/auth/PhoneVerificationField';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';
import { finalizeSignup } from '@/lib/auth/finalizeSignup';

export default function PgProfilePage() {
  const router = useRouter();
  const { setProfile } = useSignupDraftStore();

  const [name, setName] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const draft = readSignupDraft();
  const isInvited = !!draft.wsInviteToken;
  // 초대 경로: wsName/bizNo 불필요 (step 2 건너뜀)
  // 일반 경로: wsName + bizNo 필수
  const ready = !!draft.email && !!draft.password &&
    (isInvited || (!!draft.wsName && !!draft.bizNo));

  useEffect(() => {
    if (!ready) router.replace('/signup/pg');
  }, [ready, router]);

  if (!ready) return null;

  const handleVerified = (phone: string, vid: string) => {
    setVerifiedPhone(phone);
    setVerificationId(vid);
    setPhoneRequired(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    if (!name.trim()) {
      setNameError('이름을 입력해주세요.');
      return;
    }
    setNameError(null);
    if (!verifiedPhone || !verificationId) {
      setPhoneRequired(true);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    setProfile(name.trim(), verifiedPhone);
    writeSignupDraft({
      ...readSignupDraft(),
      name: name.trim(),
      phone: verifiedPhone,
      phoneVerificationId: verificationId,
    });

    // 가입 완료(미인증 유저 생성) + 자동 로그인. 일반 가입은 가드가 /pending-approval 로,
    // 초대 가입은 active 워크스페이스라 /home 으로 이동한다.
    const r = await finalizeSignup();
    if (!r.ok) {
      // 초대 경로에서 이미 가입된 이메일이면 로그인 후 초대 링크로 복귀(#8).
      if (r.redirectTo) {
        router.replace(r.redirectTo);
        return;
      }
      setSubmitError(
        r.error === 'EMAIL_TAKEN'
          ? '이미 가입된 이메일이에요. 로그인해 주세요.'
          : '가입을 완료하지 못했어요. 잠시 후 다시 시도해요.',
      );
      setSubmitting(false);
      return;
    }
    router.push(r.redirectTo);
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={isInvited ? 2 : 3} total={isInvited ? 2 : 3} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          담당자 정보
        </h2>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label
            htmlFor="name"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            이름
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
          />
          {nameError && (
            <p className="text-[11px] text-[var(--md-sys-color-error)]">{nameError}</p>
          )}
        </div>

        <PhoneVerificationField onVerified={handleVerified} />
        {attemptedSubmit && phoneRequired && !verifiedPhone && (
          <p className="text-[11px] text-[var(--md-sys-color-error)]">
            휴대전화 인증을 완료해주세요.
          </p>
        )}

        {submitError && (
          <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">
            {submitError}
          </p>
        )}

        <Button type="submit" fullWidth size="lg" disabled={submitting}>
          {submitting ? 'LOADING…' : '가입 완료'}
        </Button>
      </form>
    </div>
  );
}
