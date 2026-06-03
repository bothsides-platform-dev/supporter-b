import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await (await getUserRepo()).findById(session.user.id);

  return (
    <ApprovalWaitingScreen
      email={session.user.email ?? ''}
      emailVerified={user?.emailVerified ?? false}
    />
  );
}
