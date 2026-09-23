import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { MembersPanel } from '@/components/settings/MembersPanel';
import { SettingsPage } from '@/components/settings/SettingsPage';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/settings/members');
  }

  const wsId = session.user.workspaceId;
  const userRole = (session.user.role as 'admin' | 'member') ?? 'member';

  const workspaceRepo = await getWorkspaceRepo();
  const ws = await workspaceRepo.findById(wsId);
  if (!ws) {
    return (
      <SettingsPage title="멤버 관리">
        <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
          워크스페이스를 찾을 수 없습니다.
        </p>
      </SettingsPage>
    );
  }

  const pendingRows = await workspaceRepo.listPendingInvitations(wsId);

  const pendingInvites = pendingRows.map((r) => ({
    email: r.email,
    createdAt: r.createdAt.toISOString(),
    role: r.role as 'admin' | 'member',
  }));

  return (
    <PageEnter className="flex h-full min-h-0 flex-col">
      <MembersPanel
        workspaceId={wsId}
        workspaceName={ws.name}
        initialMembers={ws.members}
        userRole={userRole}
        initialPendingInvites={pendingInvites}
        currentUserId={session.user.id}
      />
    </PageEnter>
  );
}
