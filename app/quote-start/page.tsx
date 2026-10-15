import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getGuestRfpRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { GuestQuoteStart } from '@/components/rfp/GuestQuoteStart';
import { ChannelTalkHideButton } from '@/components/shell/ChannelTalkHideButton';
import { ConsultButton } from '@/components/landing/ConsultButton';
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
      <main className="mx-auto max-w-[608px] space-y-4 px-4 py-12">
        <h1 className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]">
          구매사 계정에서 견적을 요청해요
        </h1>
        <p>
          로그인 전 초안은 이 브라우저에 보관하고 있어요. 구매사 계정으로 전환한
          뒤 이어 쓸 수 있어요.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link className="inline-flex min-h-11 sm:min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]" href="/home">앱으로 이동해요</Link>
          <Link className="inline-flex min-h-11 sm:min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]" href="/logout">로그아웃해요</Link>
        </div>
      </main>
    );
  const industryGroups = await (await getGuestRfpRepo()).industries();
  const pgList = (await (await getWorkspaceRepo()).listCanonicalPgWorkspaces()).map(({ id, name }) => ({ id, name }));
  return (
    <main className="min-h-dvh bg-[var(--md-sys-color-surface)]">
      <ChannelTalkHideButton />
      <header className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-5 py-3">
        <Logo />
        <ConsultButton size="sm" className="min-h-11 bg-transparent font-sans text-[14px] normal-case tracking-normal text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]">문의하기</ConsultButton>
      </header>
      <GuestQuoteStart pgList={pgList} industryGroups={industryGroups} />
    </main>
  );
}
