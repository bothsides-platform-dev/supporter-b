// PG 수신함 (RSC).
//
// - `auth()` 후 `getInvitationRepo().findByPgWorkspace(workspaceId)` — 본인이
//   소속한 PG 워크스페이스로 발송된 모든 활성 invitation + RFP pair.
// - 정책: 초대된 워크스페이스 멤버 모두 접근. 미클레임 invitation 도 표시(알림
//   딥링크와 일관). 클레임 자체는 첫 진입자가 처리(감사용).
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

  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(session.user.workspaceId);

  // RSC → client component로 직렬화 가능한 plain object만 전달.
  const rows = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpId: rfp.id,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
    grade: rfp.bizProfile?.grade
      ? GRADE_LABELS[rfp.bizProfile.grade]
      : '—',
  }));

  return <InboxList rows={rows} />;
}
