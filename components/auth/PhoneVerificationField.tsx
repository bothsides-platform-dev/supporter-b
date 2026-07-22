'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sendPhoneOtpAction } from '@/lib/server/actions/auth/sendPhoneOtpAction';
import { verifyPhoneOtpAction } from '@/lib/server/actions/auth/verifyPhoneOtpAction';
import { formatPhoneInput, isCompletePhone } from '@/lib/utils/phone';

const OTP_TTL_SECONDS = 5 * 60;

interface Props {
  onVerified: (phone: string, verificationId: string) => void;
}

export function PhoneVerificationField({ onVerified }: Props) {
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
      startCountdown();
    } catch {
      setPhoneError('인증번호 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    setOtpError(null);
    setVerifying(true);
    try {
      const r = await verifyPhoneOtpAction({ phone, code: otpCode });
      if (!r.ok) {
        setOtpError(
          r.error === 'MAX_ATTEMPTS'
            ? '인증 시도 횟수를 초과했습니다. 번호를 다시 인증해주세요.'
            : '인증번호가 올바르지 않습니다.',
        );
        if (r.error === 'MAX_ATTEMPTS') setStep('input');
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

  const labelClass =
    'md-label-small text-[var(--md-sys-color-on-surface-variant)]';
  const inputClass =
    'block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] md-numeric text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors disabled:opacity-40';

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
              disabled={!isCompletePhone(phone) || sending}
              className="shrink-0 px-3 py-1.5 md-label-small border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] rounded-[6px] disabled:opacity-40 hover:border-[var(--md-sys-color-on-surface)] transition-colors"
            >
              {sending ? 'LOADING…' : step === 'otp' ? '재전송' : '인증하기'}
            </button>
          )}
          {step === 'verified' && (
            <span className="shrink-0 md-label-medium text-[var(--md-sys-color-tertiary)]">
              인증 완료 ✓
            </span>
          )}
        </div>
        {phoneError && (
          <p className="text-[11px] text-[var(--md-sys-color-error)]">{phoneError}</p>
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
              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '')); setOtpError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (otpCode.length === 6 && !verifying && countdown > 0) {
                    void handleVerify();
                  }
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
              {verifying ? 'LOADING…' : '확인'}
            </button>
          </div>
          {otpError && (
            <p className="text-[11px] text-[var(--md-sys-color-error)]">{otpError}</p>
          )}
          {countdown === 0 && (
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              인증번호가 만료되었습니다. 재전송해주세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
