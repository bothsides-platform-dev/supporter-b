// /tutorial — 진입 가드(인증·워크스페이스·완료 여부) + phase 콘텐츠. buyer는
// BuyerTutorialFlow, pg는 PgTutorialFlow가 각각 실제 여정을 채운다.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { isTutorialCompleted } from '@/lib/onboarding/visibility';
import { BuyerTutorialFlow } from '@/components/onboarding/tutorial/BuyerTutorialFlow';
import { PgTutorialFlow } from '@/components/onboarding/tutorial/PgTutorialFlow';

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

  return <PgTutorialFlow />;
}
