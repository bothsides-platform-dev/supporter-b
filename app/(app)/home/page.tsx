import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BuyerHome } from '@/components/home/BuyerHome';
import { PgHome } from '@/components/home/PgHome';
import { PgRfpBlockedToast } from '@/components/home/PgRfpBlockedToast';
import { KanbanBoardSkeleton } from '@/components/board/KanbanBoard';

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
        <Suspense fallback={<div className="px-8 py-10"><KanbanBoardSkeleton /></div>}>
          <PgHome workspaceId={session.user.workspaceId} />
        </Suspense>
      </>
    );
  }

  if (session.user.workspaceType === 'buyer' && session.user.workspaceId) {
    return (
      <Suspense fallback={<div className="px-8 py-10"><KanbanBoardSkeleton /></div>}>
        <BuyerHome workspaceId={session.user.workspaceId} />
      </Suspense>
    );
  }

  // Authenticated (passed the user.id guard above) but no usable workspace →
  // /logout, NOT /login. Middleware bounces authenticated users off /login back
  // to /home, so /login here would loop forever (ERR_TOO_MANY_REDIRECTS).
  redirect('/logout');
}
