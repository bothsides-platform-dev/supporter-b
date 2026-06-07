'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmailVerifySection } from './email-verify-section';

/**
 * 가입 후 이메일 인증 전용 화면 — /pending-approval 이 *미인증* 유저에게 보여준다.
 * 인증이 끝나면 router.refresh() 로 서버 컴포넌트를 다시 그려 기존
 * pending-approval(축하·심사 대기) 화면으로 전환한다.
 *
 * public 레이아웃(app/(public)/layout.tsx) 안의 일반 흐름 콘텐츠로 렌더링한다.
 * (풀스크린 오버레이를 쓰면 레이아웃의 푸터와 채널톡 FAB을 가린다.)
 */
async function handleLogout() {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch {
    // 세션 클리어 실패해도 /login 이동
  }
  window.location.assign('/login');
}

export function EmailVerifyScreen({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <h1 className="text-title-large">이메일을 인증해 주세요</h1>
      <p className="text-body-medium text-on-surface-variant">
        가입을 마치려면 이메일 인증이 필요해요.
        <br />
        인증하면 입점 심사가 시작됩니다.
      </p>
      <EmailVerifySection
        email={email}
        initialVerified={false}
        onVerified={() => router.refresh()}
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
