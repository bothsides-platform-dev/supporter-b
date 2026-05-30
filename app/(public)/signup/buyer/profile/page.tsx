'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { PhoneVerificationField } from '@/components/auth/PhoneVerificationField';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

export default function BuyerProfilePage() {
  const router = useRouter();
  const { setProfile } = useSignupDraftStore();

  const [name, setName] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const draft = readSignupDraft();
  const ready = !!draft.email && !!draft.password && !!draft.wsName && !!draft.bizProfile;

  useEffect(() => {
    if (!ready) router.replace('/signup/buyer');
  }, [ready, router]);

  if (!ready) return null;

  const handleVerified = (phone: string, vid: string) => {
    setVerifiedPhone(phone);
    setVerificationId(vid);
    setPhoneRequired(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
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
    setProfile(name.trim(), verifiedPhone);
    writeSignupDraft({
      ...readSignupDraft(),
      name: name.trim(),
      phone: verifiedPhone,
      phoneVerificationId: verificationId,
    });
    router.push('/signup/buyer/verify');
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={3} total={4} />

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

        <Button type="submit" fullWidth size="lg">
          다음
        </Button>
      </form>
    </div>
  );
}
