'use client';
import { continueAfterEmailVerification } from '@/lib/auth/email-verification-client';
import { useFunnelView } from '@/lib/analytics/use-funnel';

import Link from 'next/link';
import { EmailVerifySection } from './EmailVerifySection';

/**
 * 이메일 인증은 서버가 현재 브라우저 세션을 교체한 뒤 앱으로 이어진다.
 * 다른 탭의 완료 신호도 서버에서 확인하며, 입점 상태는 앱 셸이 판정한다.
 * 하드 내비게이션으로 buyer/PG 호스트 간 서버 리다이렉트도 지원한다.
 */
function handleLogout() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the logout response must clear the cookie before navigation.
  window.location.assign('/logout');
}

export function EmailVerifyScreen({ email, workspaceApproved = false }: { email: string; workspaceApproved?: boolean }) {
  useFunnelView('signup', 'email_verification');
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <h1 className="text-title-large">이메일을 인증해 주세요</h1>
      <p className="text-body-medium text-on-surface-variant">
        가입을 마치려면 이메일 인증이 필요해요.
        <br />
        {workspaceApproved
          ? '입점 승인을 마쳤어요. 이메일을 인증하면 바로 이용할 수 있어요.'
          : '이메일 인증 후 입점 심사 결과를 안내해요.'}
      </p>
      <EmailVerifySection
        email={email}
        initialVerified={false}
        onVerified={(reauthenticate, next) => { void continueAfterEmailVerification(reauthenticate, false, next); }}
      />
      <Link
        href="/"
        className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
      >
        홈으로 가기
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
      >
        로그아웃
      </button>
    </div>
  );
}
