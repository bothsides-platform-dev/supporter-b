import { FunnelView } from '@/lib/analytics/use-funnel';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { ApprovalWaitingScreen } from '@/components/pending-approval/ApprovalWaitingScreen';
import { EmailVerifyScreen } from '@/components/pending-approval/EmailVerifyScreen';
import { MembershipApprovalWaitingScreen } from '@/components/pending-approval/MembershipApprovalWaitingScreen';

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await (await getUserRepo()).findById(session.user.id);

  // 이메일 미인증이면 인증 전용 화면을, 인증 완료면 기존 pending-approval(심사 대기)
  // 화면을 보여준다. 인증 후 EmailVerifyScreen 은 견적 복귀 경로 또는 /home 으로 이동하고, (app)
  // 가드가 워크스페이스 상태에 맞는 화면(앱 진입 / 심사 대기 / 정지)으로 재분기한다.
  if (user && !user.emailVerified) {
    const workspaceApproved = !!session.user.workspaceId &&
      await (await getWorkspaceRepo()).hasActiveBusinessMembership(session.user.id, session.user.workspaceId);
    return <EmailVerifyScreen email={session.user.email ?? ''} workspaceApproved={workspaceApproved} />;
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

  if (user?.emailVerified && workspaceId &&
      await (await getWorkspaceRepo()).hasActiveBusinessMembership(session.user.id, workspaceId)) {
    redirect('/home');
  }

  return <>{session.user.workspaceType === 'buyer' && !session.user.isMaster && <FunnelView funnel="signup" step="approval_pending" />}<ApprovalWaitingScreen /></>;
}
