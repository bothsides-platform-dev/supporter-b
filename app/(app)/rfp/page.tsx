import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FileTextIcon, PlusIcon } from '@/components/icons';
import { RfpListTable, RfpListTableSkeleton } from '@/components/rfp/RfpListTable';
import { PageHeader } from '@/components/shell/PageHeader';
import { auth } from '@/auth';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { filterRfpsByParam } from '@/lib/server/status-filter';

export const dynamic = 'force-dynamic';

// Sidebar token → label map (buyer workspace)
const RFP_STATUS_LABELS: Record<string, string> = {
  draft: '작성중',
  active: '진행중',
  closed: '마감',
  awarded: '계약완료',
};

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function RfpListPage({ searchParams }: Props) {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect('/login?next=/rfp');
  }

  const { status } = await searchParams;
  const statusLabel = status ? RFP_STATUS_LABELS[status] : undefined;

  const newRfpAction = (
    <Link href="/rfp/new">
      <Button size="sm" icon={<PlusIcon />}>
        새 RFP
      </Button>
    </Link>
  );

  const wsId = session.user.workspaceId;

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title={statusLabel ?? 'RFP'} action={newRfpAction} />
            <RfpListTableSkeleton />
          </>
        }
      >
        <RfpListPageLoader wsId={wsId} status={status} statusLabel={statusLabel} newRfpAction={newRfpAction} />
      </Suspense>
    </div>
  );
}

async function RfpListPageLoader({
  wsId,
  status,
  statusLabel,
  newRfpAction,
}: {
  wsId: string;
  status: string | undefined;
  statusLabel: string | undefined;
  newRfpAction: React.ReactNode;
}) {
  const allRfps = await (await getRfpRepo()).findByBuyerWs(wsId);
  const rfps = filterRfpsByParam(allRfps, status);

  return (
    <>
      <PageHeader
        title={statusLabel ?? 'RFP'}
        count={rfps.length}
        action={newRfpAction}
      />
      {rfps.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={32} />}
          title={status ? '해당 상태의 제안 요청이 없습니다.' : '발송된 제안 요청이 없습니다.'}
          description={
            status
              ? '다른 상태를 선택하세요.'
              : '새로운 제안 요청을 작성해 PG사에 발송하세요.'
          }
        />
      ) : (
        <RfpListTable rfps={rfps} />
      )}
    </>
  );
}
