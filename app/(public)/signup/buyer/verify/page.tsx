'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/primitives/Button';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { signupEmailAction, signupCompleteAction } from '@/lib/server/actions/auth';
import { verifyEmailCodeAction } from '@/lib/server/actions/auth/verifyEmailCodeAction';
import { clearSignupDraft, readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

export default function BuyerVerifyPage() {
  const router = useRouter();
  const sentOnce = useRef(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState('');

  const draft = readSignupDraft();
  const email = draft.email ?? '';

  // 링크 클릭 경로: /auth/verify?token= 가 소비 후 돌아올 때 emailVerified=true 가 설정됨.
  const alreadyVerified = draft.emailVerified === true;

  // handleComplete 를 먼저 선언 (아래 alreadyVerified effect 에서 참조).
  const handleComplete = useCallback(async () => {
    setSubmitting(true);
    const d = readSignupDraft();
    if (!d.email || !d.password || !d.name || !d.phone || !d.phoneVerificationId || !d.wsName || !d.bizProfile) {
      setCodeError('세션이 만료되었습니다. 처음부터 다시 시도해주세요.');
      setSubmitting(false);
      return;
    }

    const r = await signupCompleteAction({
      email: d.email,
      name: d.name,
      password: d.password,
      phone: d.phone,
      phoneVerificationId: d.phoneVerificationId,
      wsKind: 'buyer',
      wsName: d.wsName,
      bizProfile: d.bizProfile,
    });

    if (!r.ok) {
      setCodeError(`가입을 완료하지 못했습니다. (${r.error})`);
      setSubmitting(false);
      return;
    }

    const signInResult = await signIn('credentials', {
      email: r.email,
      password: r.password,
      redirect: false,
    });
    clearSignupDraft();

    if (signInResult?.error) {
      router.push('/login');
      return;
    }
    router.push(r.redirectTo);
  }, [router]);

  // 진입 시 메일 발송 (mount 1회)
  useEffect(() => {
    if (!email || sentOnce.current) return;
    sentOnce.current = true;

    (async () => {
      const r = await signupEmailAction({ email, workspaceType: 'buyer' });
      if (!r.ok) {
        setSendError('인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
    })();
  }, [email]);

  // 링크 클릭 후 emailVerified=true 로 돌아온 경우 자동 완료.
  // handleComplete 는 async — setState 호출은 비동기적으로 이뤄짐(false-positive).
  useEffect(() => {
    if (!alreadyVerified) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void handleComplete();
  }, [alreadyVerified, handleComplete]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setCodeError('');

    if (!/^\d{6}$/.test(code)) {
      setCodeError('6자리 숫자를 입력해주세요.');
      return;
    }

    setSubmitting(true);
    const verifyResult = await verifyEmailCodeAction({ email, code });
    if (!verifyResult.ok) {
      setCodeError('코드가 올바르지 않거나 만료되었습니다.');
      setSubmitting(false);
      return;
    }

    // 코드 인증 성공 → draft에 emailVerified 기록
    writeSignupDraft({ ...readSignupDraft(), emailVerified: true });
    await handleComplete();
  };

  const handleResend = async () => {
    setSendError('');
    const r = await signupEmailAction({ email, workspaceType: 'buyer' });
    if (!r.ok) setSendError('재발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
  };

  if (alreadyVerified && submitting) {
    return (
      <div className="space-y-6 text-center">
        <SignupStepper current={4} total={4} />
        <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-tertiary)]">
          인증 완료. 계정 생성 중…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SignupStepper current={4} total={4} />

      <div className="space-y-4 text-center">
        <div className="flex justify-center text-[var(--md-sys-color-outline)]">
          <EnvelopeSvg size={64} />
        </div>
        <div className="space-y-2">
          <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            이메일을 인증해주세요
          </h2>
          {email && (
            <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              <span className="font-mono">{email}</span>으로 인증 메일을 보냈습니다.
            </p>
          )}
          {sendError && (
            <p role="alert" className="text-[12px] text-[var(--md-sys-color-error)]">
              {sendError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] text-center">
          메일의 [인증하기] 버튼을 눌러주세요.
          <br />
          <span className="text-[11px]">버튼이 동작하지 않으면 메일에 적힌 6자리 코드를 입력하세요.</span>
        </p>

        <form onSubmit={handleCodeSubmit} className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="emailCode"
              className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
            >
              인증 코드 (6자리)
            </label>
            <input
              id="emailCode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[20px] font-mono tracking-[0.3em] text-center text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
            />
            {codeError && (
              <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">
                {codeError}
              </p>
            )}
          </div>
          <Button type="submit" fullWidth size="lg" disabled={submitting || code.length !== 6}>
            {submitting ? 'LOADING…' : '코드로 인증하기'}
          </Button>
        </form>
      </div>

      <div className="space-y-3 text-center">
        <ResendCountdown onResend={handleResend} />
        <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          스팸함을 확인해보세요.
        </p>
      </div>
    </div>
  );
}
