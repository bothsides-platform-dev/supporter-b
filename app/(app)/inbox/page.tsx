import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getInvitationRepo } from '@/lib/server/repositories/factory';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { InboxList, InboxListSkeleton } from '@/components/inbox/InboxList';
import { Breadcrumb } from '@/components/shell/Breadcrumb';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';
import { filterInboxRowsByParam } from '@/lib/server/status-filter';

export const dynamic = 'force-dynamic';

// Sidebar token → label map (PG workspace)
const INBOX_STATUS_LABELS: Record<string, string> = {
  new: '신규',
  draft: '작성중',
  submitted: '제출완료',
  closed: '마감',
};

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/inbox');
  }

  const { status } = await searchParams;
  const statusLabel = status ? INBOX_STATUS_LABELS[status] : undefined;

  const breadcrumbSegments = statusLabel
    ? ['받은 RFP', statusLabel]
    : ['받은 RFP'];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4">
        <Breadcrumb segments={breadcrumbSegments} />
      </div>
      <PageHeader title={statusLabel ?? '받은 RFP'} />
      <Suspense fallback={<InboxListSkeleton />}>
        <InboxListLoader wsId={session.user.workspaceId} status={status} />
      </Suspense>
    </div>
  );
}

async function InboxListLoader({
  wsId,
  status,
}: {
  wsId: string;
  status: string | undefined;
}) {
  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(wsId);

  const allRows = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpStatus: rfp.status,
    rfpId: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
    grade: rfp.bizProfile?.grade
      ? GRADE_LABELS[rfp.bizProfile.grade]
      : '—',
  }));

  const rows = filterInboxRowsByParam(allRows, status);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon size={32} />}
        title="받은 제안 요청이 없습니다."
        description={
          status
            ? '해당 상태의 제안 요청이 없습니다.'
            : '구매사가 초대한 RFP가 이 화면에 표시됩니다.'
        }
      />
    );
  }

  return <InboxList rows={rows} />;
}
