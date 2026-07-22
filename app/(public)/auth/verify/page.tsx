'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { verifyEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft } from '@/lib/auth/signup-storage';

type TokenState = 'loading' | 'expired';

// `/auth/verify` is bivalent:
//   - `?token=…` → consume the verification row and redirect to /pending-approval.
//     로그인 상태면 ApprovalWaitingScreen 을 바로 볼 수 있고, 미로그인(다른 기기)이면
//     미들웨어가 /login 으로 안내한다. 실패 시 만료/오류 화면을 렌더.
//   - `?email=…` (no token) → "we sent the link" announcement.
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
      if (r.ok) {
        // 인증 완료 — 같은 탭·다른 탭 모두 /pending-approval 로 이동.
        // 로그인 상태면 이메일 인증 완료 후 ApprovalWaitingScreen 을 바로 볼 수 있고,
        // 미로그인 상태(다른 기기)면 미들웨어가 /login 으로 안내한다.
        router.push('/pending-approval');
      } else {
        setState('expired');
      }
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
        <div className="flex justify-center text-[var(--md-sys-color-on-surface-variant)]">
          <EnvelopeSvg size={80} />
        </div>
        <div className="space-y-3">
          <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            인증 메일을 보냈습니다
          </h2>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            <span className="md-numeric">{displayEmail}</span>
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            메일의 [인증하기] 버튼을 눌러주세요.<br />
            <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">15분 내 만료됩니다.</span>
          </p>
        </div>
        <div className="space-y-3">
          <ResendCountdown onResend={() => {}} />
          <Link
            href="/signup"
            className="block md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
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
    return <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)] text-center">LOADING…</p>;
  }
  if (state === 'expired') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[13px] text-[var(--md-sys-color-error)]">링크가 만료되었습니다.</p>
        <Link href="/signup" className="md-label-small text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-on-surface-variant)]">재발송 →</Link>
      </div>
    );
  }
  return null;
}

export default function AuthVerifyPage() {
  return (
    <Suspense fallback={<p className="md-label-medium text-center">LOADING…</p>}>
      <VerifyContent />
    </Suspense>
  );
}
