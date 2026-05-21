import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getInvitationRepo } from '@/lib/server/repositories/factory';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { InboxList } from '@/components/inbox/InboxList';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/inbox');
  }

  return (
    <Suspense fallback={<InboxList.Skeleton />}>
      <InboxListLoader wsId={session.user.workspaceId} />
    </Suspense>
  );
}

async function InboxListLoader({ wsId }: { wsId: string }) {
  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(wsId);

  const rows = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpId: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
    grade: rfp.bizProfile?.grade
      ? GRADE_LABELS[rfp.bizProfile.grade]
      : '—',
  }));

  return <InboxList rows={rows} />;
}
