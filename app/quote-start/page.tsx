import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getGuestRfpRepo } from '@/lib/server/repositories/factory';
import { GuestQuoteStart } from '@/components/rfp/GuestQuoteStart';
import { Logo } from '@/components/primitives/Logo';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '맞춤 PG 견적 작성',
  robots: { index: false, follow: false },
};
export default async function QuoteStartPage() {
  const session = await auth();
  if (session?.user?.workspaceType === 'buyer')
    redirect('/rfp-create');
  if (session?.user)
    return (
      <main className="mx-auto max-w-xl space-y-4 px-4 py-12">
        <h1 className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]">
          구매사 계정에서 견적을 요청해요
        </h1>
        <p>
          로그인 전 초안은 이 브라우저에 보관하고 있어요. 구매사 계정으로 전환한
          뒤 이어 쓸 수 있어요.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link className="inline-flex min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]" href="/home">앱으로 이동해요</Link>
          <Link className="inline-flex min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]" href="/logout">로그아웃해요</Link>
        </div>
      </main>
    );
  const industryGroups = await (await getGuestRfpRepo()).industries();
  return (
    <main className="min-h-dvh bg-[var(--md-sys-color-surface)]">
      <header className="border-b border-[var(--md-sys-color-outline-variant)] px-6 py-4">
        <Logo />
      </header>
      <GuestQuoteStart industryGroups={industryGroups} />
    </main>
  );
}
