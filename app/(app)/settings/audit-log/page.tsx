import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getMembership } from '@/lib/auth/active-workspace';
import { getAuditLogRepo } from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { AuditLogPanel } from '@/components/settings/AuditLogPanel';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId || !session.user.workspaceType) {
    redirect('/login?next=/settings/audit-log');
  }

  const wsId = session.user.workspaceId;

  // admin 전용 — JWT role 은 stale 할 수 있으므로 DB 멤버십으로 판정 (액션과 동일 기준).
  const membership = await getMembership(session.user.id, wsId);
  if (!membership || membership.role !== 'admin') {
    return (
      <PageEnter className="px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
          활동 기록
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          활동 기록은 관리자만 볼 수 있어요.
        </p>
      </PageEnter>
    );
  }

  const logs = await (await getAuditLogRepo()).listForWorkspace(wsId, { limit: PAGE_SIZE });
  const last = logs[logs.length - 1];
  const nextCursor =
    logs.length === PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null;

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8">
      <AuditLogPanel
        workspaceType={session.user.workspaceType}
        initialLogs={logs}
        initialNextCursor={nextCursor}
      />
    </PageEnter>
  );
}
