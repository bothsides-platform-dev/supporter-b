'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import {
  sendMyEmailVerificationAction,
  checkMyEmailVerifiedAction,
} from '@/lib/server/actions/auth';
import { verifyEmailCodeAction } from '@/lib/server/actions/auth/verifyEmailCodeAction';
import { underlineInputClass } from '@/components/forms/inputs';
import { useOtpAutoSubmit } from '@/lib/hooks/useOtpAutoSubmit';
import { cn } from '@/lib/utils';

/**
 * 가입 후 이메일 인증 섹션 — /pending-approval 에서 렌더.
 *
 * 유저는 이미 생성·로그인된 상태이므로 인증은 서버 플래그(users.emailVerified) 전환이다.
 *   - 마운트 시 인증 메일 발송(미인증인 경우 1회)
 *   - 6자리를 채우는 순간 자동 인증(같은 탭) — verifyEmailCodeAction, 버튼은 폴백
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

  const submitCode = async () => {
    if (submitting) return;
    if (!/^\d{6}$/.test(code)) {
      setError('6자리 숫자를 입력해요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const r = await verifyEmailCodeAction({ email, code });
      if (!r.ok) {
        setError('코드가 올바르지 않거나 만료되었습니다.');
        return;
      }
      setVerified(true);
    } catch {
      // reject 를 삼키면 submitting 이 true 로 굳는다 — 자동 제출이 이걸 게이트로
      // 쓰므로 화면이 통째로 죽고 라이브 리전도 '인증 중' 에 붙박인다.
      setError('인증 확인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      // 성공 시엔 verified 분기로 넘어가 이 폼이 사라지므로 무해하다.
      setSubmitting(false);
    }
  };

  // 6자리를 채우는 순간 자동 인증 — 버튼은 폴백으로 남는다. 제출 중에는 발화를
  // 미뤄야 한다: 그렇지 않으면 위의 submitting 가드에 걸려 조용히 삼켜지고,
  // 사용자는 코드를 다 넣었는데 아무 일도 일어나지 않는 상태로 남는다.
  const { reset: resetAutoSubmit } = useOtpAutoSubmit({
    code,
    enabled: !submitting,
    onComplete: () => void submitCode(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitCode();
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setResent(false);
    // 입력칸에 남은 코드는 재발송 순간 폐기된다 — 비우지 않으면 await 동안 버튼이
    // 활성인 채 남아 무효한 코드를 다시 던진다.
    const prevCode = code;
    setCode('');
    try {
      const r = await sendMyEmailVerificationAction({ resend: true });
      if (!r.ok) return failResend(prevCode);
    } catch {
      return failResend(prevCode);
    }
    // 발송이 확인된 뒤에야 기록을 지운다 — 그래야 새 코드가 우연히 같은 6자리여도
    // 자동 제출이 한 번 더 일어난다. 실패 경로에서 지우면 아래 복원이 곧바로
    // 자동 재제출로 이어져 시도 횟수를 사용자 모르게 태운다.
    resetAutoSubmit();
    setResent(true);
    setCooldown(30);
  };

  /** 재발송 실패: 서버 코드가 갈리지 않았으므로 사용자가 손에 든 코드는 아직 유효하다. */
  const failResend = (prevCode: string) => {
    setError('인증 메일을 다시 보내지 못했어요. 잠시 후 다시 시도해주세요.');
    setCode(prevCode);
  };

  if (verified) {
    return <Chip color="tertiary" label="✓ 이메일 인증 완료" />;
  }

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
          // autoComplete="one-time-code" 는 일부러 붙이지 않는다: iOS 자동완성은 이
          // 힌트에 SMS 코드를 제안하는데, 바로 앞 가입 단계에서 받은 휴대전화 OTP 가
          // 몇 분간 제안 목록에 남아 있다. 잘못 탭하면 자동 제출이 즉시 나가 시도
          // 횟수를 태운다. 메일로 온 코드는 붙여넣기·타이핑으로 들어온다.
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className={cn(
            underlineInputClass,
            'md-numeric text-[18px] tracking-[0.3em] text-center',
          )}
        />
        {error && (
          <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">
            {error}
          </p>
        )}
        {/* 6자리를 채우면 사용자 조작 없이 제출된다 — 진행 중임을 알릴 수단이 이것뿐이다.
            노드는 갈아끼우지 않고 텍스트만 바꾼다(스크린리더가 전환을 놓치지 않도록). */}
        <p role="status" className="sr-only">
          {submitting ? '인증 중이에요' : ''}
        </p>
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
