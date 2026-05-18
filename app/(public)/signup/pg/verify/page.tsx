'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft } from '@/lib/auth/signup-storage';

export default function PgVerifyPage() {
  const [resendError, setResendError] = useState('');

  const draft = readSignupDraft();
  const isInvite = !!draft.inviteToken;
  const displayEmail = draft.email ?? '';

  const handleResend = async () => {
    setResendError('');
    const currentDraft = readSignupDraft();
    const email = currentDraft.email;
    if (!email) return;
    const r = await signupEmailAction({ email, workspaceType: 'pg' });
    if (!r.ok) {
      setResendError('재발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <div className="space-y-8 text-center">

      <div className="flex justify-center text-[var(--md-sys-color-outline)]">
        <EnvelopeSvg size={80} />
      </div>

      <div className="space-y-3">
        <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          인증 메일을 보냈습니다
        </h2>
        {displayEmail && (
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            <span className="font-mono tabular-nums">{displayEmail}</span>
          </p>
        )}
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          메일의 [인증하기] 버튼을 눌러주세요.
          <br />
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            15분 내 만료됩니다.
          </span>
        </p>
      </div>

      <div className="space-y-3">
        <ResendCountdown onResend={handleResend} />
        {resendError && (
          <p
            role="alert"
            className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
          >
            {resendError}
          </p>
        )}
        {!isInvite && (
          <Link
            href="/signup/pg"
            className="block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            다른 이메일로 변경
          </Link>
        )}
      </div>

      <div className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] space-y-1">
        <p>스팸함을 확인해보세요.</p>
        <p>회사 메일의 경우 도메인 차단 여부를 확인해주세요.</p>
      </div>

    </div>
  );
}
