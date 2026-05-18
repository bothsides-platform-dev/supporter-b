import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BuyerHome } from '@/components/home/BuyerHome';
import { PgHome } from '@/components/home/PgHome';
import { PgRfpBlockedToast } from '@/components/home/PgRfpBlockedToast';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/home');

  const { notice } = await searchParams;

  if (session.user.workspaceType === 'pg' && session.user.workspaceId) {
    return (
      <>
        {notice === 'pg-rfp-blocked' && <PgRfpBlockedToast />}
        <PgHome workspaceId={session.user.workspaceId} />
      </>
    );
  }

  if (session.user.workspaceType === 'buyer' && session.user.workspaceId) {
    return <BuyerHome workspaceId={session.user.workspaceId} />;
  }

  redirect('/login');
}
