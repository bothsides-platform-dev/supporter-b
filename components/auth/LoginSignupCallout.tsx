import Link from 'next/link';
import { Button } from '@/components/primitives/Button';
import { safeInternalNext } from '@/lib/auth/safe-next';

// 신규 서비스이므로 로그인 화면에서 기존 회원 로그인보다 신규 가입을 더 강조한다.
// 폼 위에 두어 redirect 된 신규 방문자가 먼저 보게 한다.
//
// next: 로그인/가입 이후 복귀할 내부 경로. 안전한 경우에만 가입 링크에 포함되며,
// /rfp/new인 경우 견적 시작 맥락 안내 문구로 교체한다.
export function LoginSignupCallout({ next }: { next?: string | null } = {}) {
  const safeNext = safeInternalNext(next);
  const signupHref = safeNext ? `/signup?next=${encodeURIComponent(safeNext)}` : '/signup';
  const isRfpContext = safeNext === '/rfp/new';

  return (
    <div className="flex flex-col gap-[var(--s-4)] rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-primary-container)]/20 p-[var(--s-6)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          처음 오셨나요?
        </h2>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {isRfpContext
            ? '견적을 시작하려면 가입하거나 로그인해요. 가입하면 바로 견적을 받을 수 있어요.'
            : 'PG 비교 견적을 무료로 시작해보세요.'}
        </p>
      </div>
      <Link href={signupHref} className="block">
        <Button size="lg" fullWidth>
          신규 회원가입
        </Button>
      </Link>
    </div>
  );
}
