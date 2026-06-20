import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';
import { EmailVerifyScreen } from '@/components/pending-approval/email-verify-screen';
import { MembershipApprovalWaitingScreen } from '@/components/pending-approval/membership-approval-waiting-screen';

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await (await getUserRepo()).findById(session.user.id);

  // 이메일 미인증이면 인증 전용 화면을, 인증 완료면 기존 pending-approval(심사 대기)
  // 화면을 보여준다. 인증 후 EmailVerifyScreen 은 /home 으로 하드 내비게이션하고, (app)
  // 가드가 워크스페이스 상태에 맞는 화면(앱 진입 / 심사 대기 / 정지)으로 재분기한다.
  if (user && !user.emailVerified) {
    return <EmailVerifyScreen email={session.user.email ?? ''} />;
  }

  const workspaceId = session.user.workspaceId;
  if (workspaceId) {
    const memberApprovalStatus = await (await getWorkspaceRepo()).getMemberApprovalStatus(
      session.user.id,
      workspaceId,
    );
    if (memberApprovalStatus === 'rejected') {
      return <MembershipApprovalWaitingScreen initialRejected />;
    }
    if (memberApprovalStatus === 'pending_approval') {
      return <MembershipApprovalWaitingScreen />;
    }
  }

  return <ApprovalWaitingScreen />;
}
