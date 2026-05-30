'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { verifyEmailAction } from '@/lib/server/actions/auth';
import {
  readSignupDraft,
  writeSignupDraft,
} from '@/lib/auth/signup-storage';

type TokenState = 'loading' | 'success' | 'expired' | 'invalid' | 'used';

// `/auth/verify` is bivalent:
//   - `?token=…` → consume the verification row (P4). Success redirects to
//     /signup/profile carrying email + emailVerified + (optional) inviteToken
//     in sessionStorage.
//   - `?email=…` (no token) → "we sent the link" announcement (P3). This
//     replaces the old /signup/verify shell; that route still exists as a
//     redirect for back-compat and is marked for deletion in Step 13.
function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const emailQuery = searchParams.get('email');
  const [state, setState] = useState<TokenState>('loading');
  const ranOnce = useRef(false);

  useEffect(() => {
    if (token == null) return;
    // Strict-mode guard — verifyEmailAction is *atomic consume*, so a second
    // invocation on remount would always fail with TOKEN_INVALID_OR_EXPIRED.
    if (ranOnce.current) return;
    ranOnce.current = true;

    let cancelled = false;
    (async () => {
      const r = await verifyEmailAction(token);
      if (cancelled) return;
      if (!r.ok) {
        // Best-effort classification — the action returns a single error
        // for invalid/expired/used, so visually fold into 'expired'.
        setState('expired');
        return;
      }
      const draft = readSignupDraft();
      const kind = r.workspaceType ?? draft.workspaceType ?? 'buyer';
      writeSignupDraft({
        ...draft,
        email: r.email,
        emailVerified: true,
        workspaceType: kind,
        // inviteToken is the only payload that flows from the verify-row's
        // meta back into the client-side draft; sessionStorage keeps it
        // alive until /signup/workspace consumes it.
        inviteToken: r.inviteToken ?? draft.inviteToken,
      });
      setState('success');
      // 새 흐름: 이메일 인증을 마지막(step 4)으로 이동.
      // emailVerified=true 를 draft 에 기록하고 verify 페이지로 돌아가면
      // 해당 페이지가 draft.emailVerified 를 감지해 자동으로 완료 처리.
      setTimeout(() => router.push(`/signup/${kind}/verify`), 600);
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  // Announcement view — `?email=…` with no token.
  if (token == null) {
    const displayEmail = emailQuery || readSignupDraft().email || 'your@email.com';
    return (
      <div className="space-y-8 text-center">
        <div className="flex justify-center text-[var(--md-sys-color-outline)]">
          <EnvelopeSvg size={80} />
        </div>
        <div className="space-y-3">
          <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            인증 메일을 보냈습니다
          </h2>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            <span className="font-mono tabular-nums">{displayEmail}</span>
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            메일의 [인증하기] 버튼을 눌러주세요.<br />
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">15분 내 만료됩니다.</span>
          </p>
        </div>
        <div className="space-y-3">
          <ResendCountdown onResend={() => {}} />
          <Link
            href="/signup"
            className="block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            다른 이메일로 변경
          </Link>
        </div>
        <div className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] space-y-1">
          <p>스팸함을 확인해보세요.</p>
          <p>회사 메일의 경우 도메인 차단 여부를 확인해주세요.</p>
        </div>
      </div>
    );
  }

  // Token verification view.
  if (state === 'loading') {
    return <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)] text-center">LOADING…</p>;
  }
  if (state === 'success') {
    return <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-tertiary)] text-center">인증 완료. 이동 중…</p>;
  }
  if (state === 'expired') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[13px] text-[var(--md-sys-color-error)]">링크가 만료되었습니다.</p>
        <Link href="/signup" className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-on-surface-variant)]">재발송 →</Link>
      </div>
    );
  }
  if (state === 'used') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">이미 사용된 링크입니다.</p>
        <Link href="/login" className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface)]">로그인 →</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4 text-center">
      <p className="text-[13px] text-[var(--md-sys-color-error)]">잘못된 링크입니다.</p>
      <Link href="/login" className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface)]">로그인 →</Link>
    </div>
  );
}

export default function AuthVerifyPage() {
  return (
    <Suspense fallback={<p className="font-mono text-[12px] tracking-[0.16em] uppercase text-center">LOADING…</p>}>
      <VerifyContent />
    </Suspense>
  );
}
