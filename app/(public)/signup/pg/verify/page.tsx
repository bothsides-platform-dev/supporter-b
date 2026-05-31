'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/primitives/Button';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { signupEmailAction, signupCompleteAction, signupViaWorkspaceInviteAction } from '@/lib/server/actions/auth';
import { verifyEmailCodeAction } from '@/lib/server/actions/auth/verifyEmailCodeAction';
import { clearSignupDraft, readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

export default function PgVerifyPage() {
  const router = useRouter();
  const sentOnce = useRef(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState('');

  const draft = readSignupDraft();
  const email = draft.email ?? '';
  const alreadyVerified = draft.emailVerified === true;
  const isInvited = !!draft.wsInviteToken;

  // handleComplete 를 먼저 선언 (아래 alreadyVerified effect 에서 참조).
  const handleComplete = useCallback(async () => {
    setSubmitting(true);
    const d = readSignupDraft();

    // 공통 필드 검증
    if (!d.email || !d.password || !d.name || !d.phone || !d.phoneVerificationId) {
      setCodeError('세션이 만료됐어요. 처음부터 다시 시도해요.');
      setSubmitting(false);
      return;
    }

    let r;

    if (d.wsInviteToken) {
      // ── 초대 경로: 기존 워크스페이스에 member로 합류 ──────────────────
      r = await signupViaWorkspaceInviteAction({
        email: d.email,
        name: d.name,
        password: d.password,
        phone: d.phone,
        phoneVerificationId: d.phoneVerificationId,
        wsInviteToken: d.wsInviteToken,
      });
    } else {
      // ── 일반 경로: 새 워크스페이스 생성 ──────────────────────────────
      if (!d.wsName || !d.bizNo) {
        setCodeError('세션이 만료됐어요. 처음부터 다시 시도해요.');
        setSubmitting(false);
        return;
      }
      r = await signupCompleteAction({
        email: d.email,
        name: d.name,
        password: d.password,
        phone: d.phone,
        phoneVerificationId: d.phoneVerificationId,
        wsKind: 'pg',
        wsName: d.wsName,
        pgProfile: { bizNo: d.bizNo },
      });
    }

    if (!r.ok) {
      setCodeError(`가입을 완료하지 못했어요. (${r.error})`);
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

  // 진입 시 메일 발송
  useEffect(() => {
    if (!email || sentOnce.current) return;
    sentOnce.current = true;

    (async () => {
      const r = await signupEmailAction({
        email,
        workspaceType: 'pg',
        ...(draft.inviteToken ? { inviteToken: draft.inviteToken } : {}),
      });
      if (!r.ok) {
        if (r.error === 'EMAIL_TAKEN') {
          setSendError('EMAIL_TAKEN');
        } else {
          setSendError('인증 메일을 보내지 못했어요. 잠시 후 다시 시도해요.');
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setCodeError('6자리 숫자를 입력해요.');
      return;
    }

    setSubmitting(true);
    const verifyResult = await verifyEmailCodeAction({ email, code });
    if (!verifyResult.ok) {
      setCodeError('코드가 올바르지 않거나 만료되었습니다.');
      setSubmitting(false);
      return;
    }

    writeSignupDraft({ ...readSignupDraft(), emailVerified: true });
    await handleComplete();
  };

  const handleResend = async () => {
    setSendError('');
    const r = await signupEmailAction({
      email,
      workspaceType: 'pg',
      ...(draft.inviteToken ? { inviteToken: draft.inviteToken } : {}),
    });
    if (!r.ok) {
      if (r.error === 'EMAIL_TAKEN') {
        setSendError('EMAIL_TAKEN');
      } else {
        setSendError('다시 보내지 못했어요. 잠시 후 다시 시도해요.');
      }
    }
  };

  // 초대 경로: 3단계 (account → profile → verify). 직접 가입: 4단계.
  const stepperValue = isInvited ? 3 : 4;

  if (alreadyVerified && submitting) {
    return (
      <div className="space-y-6 text-center">
        <SignupStepper current={stepperValue} total={stepperValue} />
        <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-tertiary)]">
          인증 완료. 계정 생성 중…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SignupStepper current={stepperValue} total={stepperValue} />

      <div className="space-y-4 text-center">
        <div className="flex justify-center text-[var(--md-sys-color-outline)]">
          <EnvelopeSvg size={64} />
        </div>
        <div className="space-y-2">
          <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            이메일을 인증해요
          </h2>
          {email && (
            <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              <span className="font-mono">{email}</span>으로 인증 메일을 보냈어요.
            </p>
          )}
          {sendError === 'EMAIL_TAKEN' ? (
            <p role="alert" className="text-[12px] text-[var(--md-sys-color-error)]">
              이미 가입된 이메일입니다.{' '}
              <Link
                href={`/login?email=${encodeURIComponent(email)}`}
                className="underline"
              >
                로그인
              </Link>
              하시겠어요?
            </p>
          ) : sendError ? (
            <p role="alert" className="text-[12px] text-[var(--md-sys-color-error)]">{sendError}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] text-center">
          메일의 [인증하기] 버튼을 눌러요.
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
              <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">{codeError}</p>
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
          스팸함을 확인해요.
        </p>
      </div>
    </div>
  );
}
