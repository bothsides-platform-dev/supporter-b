'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import Link from 'next/link';
import { passwordForgotAction } from '@/lib/server/actions/auth';
import { underlineInputClass } from '@/components/forms/inputs';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Action always returns ok:true (info-leak protection); UI shows the same
    // confirmation regardless of whether the email was on file.
    await passwordForgotAction({ email });
    setSubmitting(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-8 text-center">
        <div className="flex justify-center text-[var(--md-sys-color-on-surface-variant)]"><EnvelopeSvg size={80} /></div>
        <div className="space-y-3">
          <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">재설정 링크를 보냈습니다</h2>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]"><span className="md-numeric">{email}</span></p>
          <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">30분 내 만료됩니다.</p>
        </div>
        <ResendCountdown onResend={() => {}} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">비밀번호 찾기</h2>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label htmlFor="email" className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">이메일</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            className={underlineInputClass}
            placeholder="your@email.com" />
        </div>
        <Button type="submit" fullWidth size="lg" disabled={submitting || !email.trim()}>
          {submitting ? '처리 중…' : '재설정 링크 받기'}
        </Button>
      </form>
      <div className="text-center">
        <Link href="/login" className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors">← 로그인으로</Link>
      </div>
    </div>
  );
}
