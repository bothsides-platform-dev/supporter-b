import Link from 'next/link';
import { Button } from '@/components/primitives/Button';

// 신규 서비스이므로 로그인 화면에서 기존 회원 로그인보다 신규 가입을 더 강조한다.
// 폼 위에 두어 redirect 된 신규 방문자가 먼저 보게 한다.
export function LoginSignupCallout() {
  return (
    <div className="flex flex-col gap-[var(--s-4)] rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-primary-container)]/20 p-[var(--s-6)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          처음 오셨나요?
        </h2>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          PG 비교 견적을 무료로 시작해보세요.
        </p>
      </div>
      <Link href="/signup" className="block">
        <Button size="lg" fullWidth>
          신규 회원가입
        </Button>
      </Link>
    </div>
  );
}
