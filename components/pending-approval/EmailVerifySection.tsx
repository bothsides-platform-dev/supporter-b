'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import {
  sendMyEmailVerificationAction,
  checkMyEmailVerifiedAction,
} from '@/lib/server/actions/auth';
import { verifyEmailCodeAction } from '@/lib/server/actions/auth/verifyEmailCodeAction';

/**
 * 가입 후 이메일 인증 섹션 — /pending-approval 에서 렌더.
 *
 * 유저는 이미 생성·로그인된 상태이므로 인증은 서버 플래그(users.emailVerified) 전환이다.
 *   - 마운트 시 인증 메일 발송(미인증인 경우 1회)
 *   - 6자리 코드 입력으로 인증(같은 탭) — verifyEmailCodeAction
 *   - 다른 탭/기기에서 링크를 누르면 폴링으로 감지해 ✓ 로 전환
 */
export function EmailVerifySection({
  email,
  initialVerified,
  onVerified,
}: {
  email: string;
  initialVerified: boolean;
  /** 인증이 완료되는 순간 1회 호출 — 호출부가 화면을 전환하는 데 사용(현재 caller 는
   *  /home 으로 하드 내비게이션해 (app) 가드가 워크스페이스 상태에 맞게 재분기하도록 한다). */
  onVerified?: () => void;
}) {
  const [verified, setVerified] = useState(initialVerified);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0); // 재발송 쿨다운(초) — 0이면 발송 가능
  const [resent, setResent] = useState(false); // 재발송 직후 피드백 노출 여부
  const sentOnce = useRef(false);
  const notifiedRef = useRef(false);

  // 인증 완료 순간 onVerified 1회 호출 (코드 입력·폴링 어느 경로든).
  useEffect(() => {
    if (verified && !notifiedRef.current) {
      notifiedRef.current = true;
      onVerified?.();
    }
  }, [verified, onVerified]);

  // 마운트 시 인증 메일 발송 (미인증 1회).
  useEffect(() => {
    if (verified || sentOnce.current) return;
    sentOnce.current = true;
    void sendMyEmailVerificationAction();
  }, [verified]);

  // 재발송 쿨다운 카운트다운 — 1초마다 1씩 감소, 언마운트 시 정리.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // 다른 탭/기기 링크 클릭 감지용 폴링.
  useEffect(() => {
    if (verified) return;
    let active = true;
    const id = setInterval(async () => {
      const r = await checkMyEmailVerifiedAction();
      if (active && r.verified) {
        setVerified(true);
        clearInterval(id);
      }
    }, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [verified]);

  if (verified) {
    return <Chip color="tertiary" label="✓ 이메일 인증 완료" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!/^\d{6}$/.test(code)) {
      setError('6자리 숫자를 입력해요.');
      return;
    }
    setSubmitting(true);
    setError('');
    const r = await verifyEmailCodeAction({ email, code });
    if (!r.ok) {
      setError('코드가 올바르지 않거나 만료되었습니다.');
      setSubmitting(false);
      return;
    }
    setVerified(true);
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setResent(false);
    await sendMyEmailVerificationAction({ resend: true });
    setResent(true);
    setCooldown(30);
  };

  return (
    <div className="w-full max-w-sm space-y-3 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] p-4 text-left">
      <div className="space-y-1">
        <p className="text-body-small text-on-surface-variant">
          <span className="md-numeric">{email}</span> 으로 보낸 메일의 [인증하기] 버튼을 누르거나,
          아래에 6자리 코드를 입력해요.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label
          htmlFor="approvalEmailCode"
          className="md-label-small text-[var(--md-sys-color-on-surface-variant)]"
        >
          인증 코드 (6자리)
        </label>
        <input
          id="approvalEmailCode"
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 md-numeric text-[18px] tracking-[0.3em] text-center text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
        />
        {error && (
          <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth size="md" disabled={submitting || code.length !== 6}>
          {submitting ? 'LOADING…' : '코드로 인증하기'}
        </Button>
      </form>

      <div className="space-y-1">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-[var(--md-sys-color-on-surface-variant)]"
        >
          {cooldown > 0 ? `${cooldown}초 후 다시 보낼 수 있어요` : '인증 메일 다시 보내기'}
        </button>
        {resent && (
          <p className="text-body-small text-on-surface-variant">메일을 다시 보냈어요</p>
        )}
      </div>
    </div>
  );
}
