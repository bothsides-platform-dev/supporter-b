'use client';

import { useRouter } from 'next/navigation';
import { EmailVerifySection } from './email-verify-section';

/**
 * 가입 후 이메일 인증 전용 화면 — /pending-approval 이 *미인증* 유저에게 보여준다.
 * 인증이 끝나면 router.refresh() 로 서버 컴포넌트를 다시 그려 기존
 * pending-approval(축하·심사 대기) 화면으로 전환한다.
 */
export function EmailVerifyScreen({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--md-sys-color-surface)] px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
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
      </div>
    </div>
  );
}
