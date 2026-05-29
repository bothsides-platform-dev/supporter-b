import { redirect } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { workspaceInvitations } from '@/lib/db/schema';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { MembersPanel } from '@/components/settings/MembersPanel';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/settings/members');
  }

  const wsId = session.user.workspaceId;
  const userRole = (session.user.role as 'admin' | 'member') ?? 'member';

  const ws = await (await getWorkspaceRepo()).findById(wsId);
  if (!ws) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          워크스페이스를 찾을 수 없습니다.
        </p>
      </div>
    );
  }

  const pendingRows = await db
    .select({
      email: workspaceInvitations.invitedEmail,
      createdAt: workspaceInvitations.createdAt,
      role: workspaceInvitations.role,
    })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.workspaceId, wsId),
        eq(workspaceInvitations.status, 'pending'),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    );

  const pendingInvites = pendingRows.map((r) => ({
    email: r.email,
    createdAt: r.createdAt.toISOString(),
    role: r.role,
  }));

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8 space-y-8 md:space-y-10">
      <MembersPanel
        workspaceName={ws.name}
        initialMembers={ws.members}
        userRole={userRole}
        initialPendingInvites={pendingInvites}
        currentUserId={session.user.id}
      />
    </PageEnter>
  );
}
