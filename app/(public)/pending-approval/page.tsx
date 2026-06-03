import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';
import { EmailVerifyScreen } from '@/components/pending-approval/email-verify-screen';

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await (await getUserRepo()).findById(session.user.id);

  // 이메일 미인증이면 인증 전용 화면을, 인증 완료면 기존 pending-approval(심사 대기)
  // 화면을 보여준다. 인증 후 EmailVerifyScreen 이 router.refresh() 로 전환한다.
  if (user && !user.emailVerified) {
    return <EmailVerifyScreen email={session.user.email ?? ''} />;
  }

  return <ApprovalWaitingScreen />;
}
