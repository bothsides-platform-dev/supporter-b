'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sendPhoneOtpAction } from '@/lib/server/actions/auth/sendPhoneOtpAction';
import { verifyPhoneOtpAction } from '@/lib/server/actions/auth/verifyPhoneOtpAction';
import { formatPhoneInput, isCompletePhone } from '@/lib/utils/phone';
import { resolveSecurityMethod } from '@/lib/signing/security-method';
import { underlineInputClass } from '@/components/forms/inputs';
import { useOtpAutoSubmit } from '@/lib/hooks/useOtpAutoSubmit';
import { cn } from '@/lib/utils';

const OTP_TTL_SECONDS = 5 * 60;

interface Props {
  onVerified: (phone: string, verificationId: string) => void;
  /**
   * 간편인증(서명 본인인증)용 번호를 받는 화면인가.
   *
   * OTP 왕복 자체는 `01[0-9]` 를 전부 통과시키는데(`isCompletePhone`·`normalizePhone`)
   * 간편인증은 **010 만** 받는다(`resolveSecurityMethod`). 그래서 011 번호는 여기를
   * 지나 **실제 SMS 가 나가고** 인증번호까지 맞힌 뒤 마지막 저장에서야 거절된다 —
   * 실비가 나가고 규칙은 여정의 맨 끝에서 드러난다. 규칙이 걸리는 화면에서는 SMS
   * 이전에 막는다.
   *
   * 기본값은 끈다 — 규칙이 걸리는 화면에서만 켠다(현재 설정 > 프로필과 가입 프로필).
   * 옵트인으로 두는 이유는 OTP 자체는 여전히 `01[0-9]` 를 받기 때문이다 — 기존
   * 01X 계정의 재인증 같은 경로까지 이 게이트로 막지 않는다.
   */
  requireMobile010?: boolean;
}

export function PhoneVerificationField({ onVerified, requireMobile010 = false }: Props) {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'input' | 'otp' | 'verified'>('input');
  const [otpCode, setOtpCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  // 6자리를 채우는 순간 자동 인증 — 확인 버튼은 폴백으로 남는다. 게이트는 입력의
  // disabled 조건과 별개로 여기서도 건다: 재전송 대기(sending) 중에는 OTP 입력이
  // 열려 있어, 곧 폐기될 서버 행에 대고 시도 횟수를 태울 수 있다.
  const { reset: resetAutoSubmit } = useOtpAutoSubmit({
    code: otpCode,
    enabled: !verifying && !sending && countdown > 0,
    onComplete: () => void handleVerify(),
  });

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Restore caret after hyphen masking so editing mid-string doesn't jump the
  // cursor to the end. caretRef holds the target offset computed in onChange.
  useLayoutEffect(() => {
    if (caretRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [phone]);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const raw = el.value;
    const selStart = el.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, selStart).replace(/\D/g, '').length;
    const formatted = formatPhoneInput(raw);
    // Map the digit-count caret back to an offset in the formatted string.
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < digitsBeforeCaret) {
      if (/\d/.test(formatted[pos])) seen++;
      pos++;
    }
    caretRef.current = pos;
    setPhone(formatted);
    setPhoneError(null);
  }

  function startCountdown() {
    if (timerRef.current) clearInterval(timerRef.current);
    setCountdown(OTP_TTL_SECONDS);
    timerRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearInterval(timerRef.current!); return 0; }
        return n - 1;
      });
    }, 1000);
  }

  async function handleSend() {
    setPhoneError(null);
    setSending(true);
    try {
      const r = await sendPhoneOtpAction({ phone });
      if (!r.ok) {
        setPhoneError(
          r.error === 'RATE_LIMITED'
            ? '잠시 후 다시 시도해주세요. (10분 내 3회 제한)'
            : r.error === 'SMS_FAILED'
              ? '인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.'
              : '올바른 휴대전화 번호를 입력해주세요.',
        );
        return;
      }
      setStep('otp');
      setOtpCode('');
      setOtpError(null);
      // 서버 코드가 갈렸으니 직전 자동 제출 기록을 지운다 — 새 코드가 우연히
      // 같은 6자리여도 자동 제출이 한 번 더 일어나야 한다.
      resetAutoSubmit();
      startCountdown();
    } catch {
      setPhoneError('인증번호 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    if (verifying) return;
    setOtpError(null);
    setVerifying(true);
    try {
      const r = await verifyPhoneOtpAction({ phone, code: otpCode });
      if (!r.ok) {
        if (r.error === 'MAX_ATTEMPTS') {
          // step 을 되돌리면 OTP 블록이 통째로 사라진다 — 안내는 그 블록 밖에서
          // 사는 phoneError 로 띄워야 사용자가 이유를 볼 수 있다.
          setPhoneError('인증 시도 횟수를 초과했습니다. 번호를 다시 인증해주세요.');
          setOtpCode('');
          setStep('input');
          return;
        }
        setOtpError('인증번호가 올바르지 않습니다.');
        return;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setStep('verified');
      // Submit the hyphenated format as-is; the server normalizes for storage.
      onVerified(phone, r.verificationId);
    } catch {
      setOtpError('인증 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setOtpCode('');
    setOtpError(null);
    await handleSend();
  }

  // 번호를 **다 친 뒤에만** 말한다 — 타이핑 중(`010` 두 글자)에 빨간 안내가 뜨면
  // 맞게 치고 있는 사람을 나무라는 꼴이다.
  //
  // 판정은 서버 게이트와 **같은 함수**를 부른다. 여기 정규식을 따로 두면 두 번째
  // 출처가 되고, 실제로 그렇게 어긋나 있었다 — 로컬 규칙은 10자리를 통과시키는데
  // 간편인증은 11자리만 받아서, 10자리 010 번호가 SMS 와 OTP 를 다 거친 뒤에야
  // 거절됐다. 함수를 직접 부르면 그 드리프트가 표현 불가능해진다.
  const blockedNon010 =
    requireMobile010 && isCompletePhone(phone) && !resolveSecurityMethod(phone).enforced;

  // 서버 오류가 있으면 그쪽이 이긴다(더 구체적이다). 문구를 여기서 한 번만 정해
  // 조건과 렌더가 어긋날 수 없게 한다.
  const shownPhoneError =
    phoneError ?? (blockedNon010 ? '간편인증은 010 번호만 지원해요.' : null);

  const labelClass =
    'md-label-small text-[var(--md-sys-color-on-surface-variant)]';
  const inputClass = cn(underlineInputClass, 'md-numeric disabled:opacity-40');

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0');
  const ss = String(countdown % 60).padStart(2, '0');

  return (
    <div className="space-y-3">
      {/* Phone input row */}
      <div className="space-y-1">
        <label htmlFor="phone" className={labelClass}>
          휴대전화
        </label>
        <div className="flex gap-2 items-end">
          <input
            ref={inputRef}
            id="phone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={handlePhoneChange}
            autoComplete="tel"
            placeholder="010-0000-0000"
            disabled={step === 'verified' || sending}
            className={inputClass + ' flex-1'}
          />
          {step !== 'verified' && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!isCompletePhone(phone) || blockedNon010 || sending}
              className="shrink-0 px-3 py-1.5 md-label-small border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] rounded-[6px] disabled:opacity-40 hover:border-[var(--md-sys-color-on-surface)] transition-colors"
            >
              {sending ? '처리 중…' : step === 'otp' ? '재전송' : '인증하기'}
            </button>
          )}
          {step === 'verified' && (
            <span className="shrink-0 md-label-medium text-[var(--md-sys-color-tertiary)]">
              인증 완료 ✓
            </span>
          )}
        </div>
        {shownPhoneError && (
          <p className="text-xs text-[var(--md-sys-color-error)]">{shownPhoneError}</p>
        )}
      </div>

      {/* OTP input row */}
      {step === 'otp' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="otp-code" className={labelClass}>
              인증번호
            </label>
            <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
              {countdown > 0 ? <span className="md-numeric">{`${mm}:${ss}`}</span> : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="underline text-[var(--md-sys-color-primary)]"
                >
                  재전송
                </button>
              )}
            </span>
          </div>
          <div className="flex gap-2 items-end">
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              autoComplete="one-time-code"
              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '')); setOtpError(null); }}
              // Enter 는 언제나 부모 가입 폼의 제출을 막는다. 그 위에서, 실패 후
              // 같은 코드를 다시 던지는 경로로 남는다 — 자동 제출은 같은 코드로
              // 두 번 발화하지 않으므로 재시도 수단이 버튼뿐이면 안 된다.
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (otpCode.length === 6 && !verifying && countdown > 0) {
                  void handleVerify();
                }
              }}
              placeholder="6자리 입력"
              disabled={verifying || countdown === 0}
              className={inputClass + ' flex-1 tracking-[0.3em]'}
            />
            <button
              type="button"
              onClick={handleVerify}
              disabled={otpCode.length !== 6 || verifying || countdown === 0}
              className="shrink-0 px-3 py-1.5 md-label-small border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] rounded-[6px] disabled:opacity-40 hover:border-[var(--md-sys-color-on-surface)] transition-colors"
            >
              {verifying ? '처리 중…' : '확인'}
            </button>
          </div>
          {otpError && (
            <p role="alert" className="text-xs text-[var(--md-sys-color-error)]">
              {otpError}
            </p>
          )}
          {/* 6자리를 채우면 사용자 조작 없이 제출된다 — 진행 중임을 알릴 수단이 이것뿐이다.
              노드는 갈아끼우지 않고 텍스트만 바꾼다(스크린리더가 전환을 놓치지 않도록). */}
          <p role="status" className="sr-only">
            {verifying ? '인증 중이에요' : ''}
          </p>
          {countdown === 0 && (
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              인증번호가 만료되었습니다. 재전송해주세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
