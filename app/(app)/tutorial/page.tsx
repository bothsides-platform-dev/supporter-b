// /tutorial — 진입 가드(인증·워크스페이스·완료 여부) + phase 콘텐츠. buyer는
// BuyerTutorialFlow(PR3)가 실제 여정을 채운다. pg는 아직 플레이스홀더(후속 PR4).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { isTutorialCompleted } from '@/lib/onboarding/visibility';
import { PageEnter } from '@/components/primitives/PageEnter';
import { Button } from '@/components/primitives/Button';
import { BuyerTutorialFlow } from '@/components/onboarding/tutorial/BuyerTutorialFlow';

export const dynamic = 'force-dynamic';

export default async function TutorialPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/tutorial');

  const { workspaceType, id: userId } = session.user;
  if (workspaceType !== 'buyer' && workspaceType !== 'pg') redirect('/logout');

  const key = workspaceType === 'buyer' ? 'buyerTutorial' : 'pgTutorial';
  const onboarding = await (await getUserRepo()).getOnboarding(userId);
  if (isTutorialCompleted(onboarding, key)) redirect('/home');

  if (workspaceType === 'buyer') {
    return <BuyerTutorialFlow />;
  }

  return (
    <PageEnter className="flex flex-1 items-center justify-center px-8 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
          튜토리얼을 준비하고 있어요
        </p>
        <Link href="/home">
          <Button variant="outlined" size="sm">홈으로</Button>
        </Link>
      </div>
    </PageEnter>
  );
}
