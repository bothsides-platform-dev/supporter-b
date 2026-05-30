import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return <ApprovalWaitingScreen />;
}
