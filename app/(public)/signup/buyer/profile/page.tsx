'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { PhoneVerificationField } from '@/components/auth/PhoneVerificationField';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { readSignupDraft, writeSignupDraft, isSignupStorageAvailable } from '@/lib/auth/signup-storage';
import { finalizeSignup } from '@/lib/auth/finalize-signup';
import { underlineInputClass } from '@/components/forms/inputs';

export default function BuyerProfilePage() {
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

  // 가드는 "1·2단계를 건너뛰고 직접 진입"만 막는다. 가입 완료가 성공하면
  // finalizeSignup 이 clearSignupDraft 로 draft 를 비우는데, 이후 router.push 전이로
  // 페이지가 한 번 더 렌더되면 draft 가 비어 ready 가 false → 첫 가입 화면으로 튕긴다.
  // 그래서 도착 시점에 한 번만 판정해 고정한다(useState 초기화로 1회 계산, 이후 불변).
  const [storageBlocked] = useState(() => !isSignupStorageAvailable());

  const [ready] = useState(() => {
    const d = readSignupDraft();
    return !!d.email && !!d.password && !!d.wsName && !!d.bizProfile;
  });

  useEffect(() => {
    if (!ready && !storageBlocked) router.replace('/signup/buyer');
  }, [ready, storageBlocked, router]);

  if (!ready && !storageBlocked) return null;

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

    // 가입 완료(미인증 유저 생성) + 자동 로그인. 이후 가드가 /pending-approval 로 보냄.
    let r;
    try {
      r = await finalizeSignup();
    } catch (err) {
      console.error('[signup:buyer] finalizeSignup threw:', err);
      setSubmitError('가입을 완료하지 못했어요. 잠시 후 다시 시도해요.');
      setSubmitting(false);
      return;
    }
    if (!r.ok) {
      // 초대 경로에서 이미 가입된 이메일이면 로그인 후 초대 링크로 복귀(#8).
      if (r.redirectTo) {
        router.replace(r.redirectTo);
        return;
      }
      console.error('[signup:buyer] finalizeSignup error:', r.error);
      setSubmitError(
        r.error === 'EMAIL_TAKEN'
          ? '이미 가입된 이메일이에요. 로그인해 주세요.'
          : r.error === 'MASTER_EMAIL'
            ? '이 이메일로는 가입할 수 없어요. 다른 이메일을 사용해 주세요.'
            : '가입을 완료하지 못했어요. 잠시 후 다시 시도해요.',
      );
      setSubmitting(false);
      return;
    }
    // Hard-navigate for both absolute and relative targets.
    // router.push triggers an RSC fetch that fails when Turbopack hasn't compiled
    // the target route yet (the compilation race that strands users at /login).
    // window.location.assign is also required for cross-origin absolute URLs
    // because router.push would follow the (app) shell redirect via RSC fetch,
    // hitting browser CORS on partner.support-b.com.
    window.location.assign(r.redirectTo);
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={3} total={3} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          담당자 정보
        </h2>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {storageBlocked && (
          <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">
            브라우저의 사이트 데이터 저장이 차단되어 있어요.
            비공개(시크릿) 모드를 해제하거나 일반 탭에서 다시 시도해주세요.
          </p>
        )}

        <div className="space-y-1">
          <label
            htmlFor="name"
            className="md-label-small text-[var(--md-sys-color-on-surface-variant)]"
          >
            이름
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className={underlineInputClass}
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
