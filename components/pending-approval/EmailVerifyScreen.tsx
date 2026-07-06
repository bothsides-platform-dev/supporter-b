'use client';

import Link from 'next/link';
import { EmailVerifySection } from './EmailVerifySection';

/**
 * 가입 후 이메일 인증 전용 화면 — /pending-approval 이 *미인증* 유저에게 보여준다.
 * 인증이 끝나면 /home 으로 하드 내비게이션(window.location.assign)해 (app) 가드가
 * 워크스페이스 상태로 재분기하게 한다:
 *   - active(정규 PG 가입) → 앱으로 바로 진입
 *   - pending(buyer/일반 PG) → 가드가 다시 /pending-approval 로 보내 심사 대기 화면 노출
 * router.push/refresh(소프트 내비)를 쓰지 않는 이유: 미인증 유저가 다른 호스트의
 * /pending-approval 에 있을 수 있고, 그때 (app) 가드의 cross-host redirect 를 RSC fetch 로
 * 따라가면 CORS 에 막힌다(코드베이스 cross-host 불변식 — 로그아웃도 같은 이유로 assign 사용).
 *
 * public 레이아웃(app/(public)/layout.tsx) 안의 일반 흐름 콘텐츠로 렌더링한다.
 * (풀스크린 오버레이를 쓰면 레이아웃의 푸터와 채널톡 FAB을 가린다.)
 */
function handleLogout() {
  window.location.assign('/logout');
}

// 인증 완료 후 이동 — 하드 내비(위 docblock 의 cross-host 불변식 참고).
function handleVerified() {
  window.location.assign('/home');
}

export function EmailVerifyScreen({ email }: { email: string }) {
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
        onVerified={handleVerified}
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
