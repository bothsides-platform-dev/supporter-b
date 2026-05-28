import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FileTextIcon, PlusIcon } from '@/components/icons';
import { RfpListTable, RfpListTableSkeleton } from '@/components/rfp/RfpListTable';
import { PipelineBoard } from '@/components/board/PipelineBoard';
import { BoardViewToggle } from '@/components/board/BoardViewToggle';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { RfpPeekPanel, RfpPeekPanelSkeleton } from '@/components/rfp/RfpPeekPanel';
import { SplitView } from '@/components/ui/split-view';
import { auth } from '@/auth';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { filterRfps, resolveBoardView, type BoardView, type BoardFilterParams } from '@/lib/server/board/filterRfps';
import { GRADE_LABELS } from '@/lib/types/biz-profile';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'draft', label: '작성중' },
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '마감' },
  { value: 'awarded', label: '계약완료' },
];
const GRADE_OPTIONS = Object.entries(GRADE_LABELS).map(([value, label]) => ({ value, label }));

type Props = {
  searchParams: Promise<{ status?: string; deadline?: string; grade?: string; view?: string; peek?: string }>;
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

  const sp = await searchParams;
  const cookieStore = await cookies();
  const view = resolveBoardView(sp.view, cookieStore.get('rfpBoardView')?.value);
  const wsId = session.user.workspaceId;
  const userId = session.user.id;
  const userName = session.user.name ?? session.user.email ?? '구매사 담당자';

  const newRfpAction = (
    <Link href="/rfp/new">
      <Button size="sm" icon={<PlusIcon />}>
        새 RFP
      </Button>
    </Link>
  );

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title="RFP" action={newRfpAction} />
            <RfpListTableSkeleton />
          </>
        }
      >
        <RfpListPageLoader
          wsId={wsId}
          userId={userId}
          userName={userName}
          params={sp}
          view={view}
          newRfpAction={newRfpAction}
          peek={sp.peek}
        />
      </Suspense>
    </div>
  );
}

async function RfpListPageLoader({
  wsId,
  userId,
  userName,
  params,
  view,
  newRfpAction,
  peek,
}: {
  wsId: string;
  userId: string;
  userName: string;
  params: BoardFilterParams;
  view: BoardView;
  newRfpAction: React.ReactNode;
  peek?: string;
}) {
  const now = new Date();
  const allRfps = await (await getRfpRepo()).findByBuyerWs(wsId);
  const rfps = filterRfps(allRfps, params, now);

  const listContent =
    view === 'board' ? (
      <RfpBoardView wsId={wsId} visibleIds={new Set(rfps.map((r) => r.id))} />
    ) : rfps.length === 0 ? (
      <EmptyState
        icon={<FileTextIcon size={32} />}
        title="조건에 맞는 제안 요청이 없습니다."
        description="필터를 바꾸거나 새 제안 요청을 작성하세요."
      />
    ) : (
      <RfpListTable rfps={rfps} />
    );

  const panel = peek ? (
    <Suspense fallback={<RfpPeekPanelSkeleton rfpCode={peek} />}>
      <RfpPeekPanel rfpCode={peek} wsId={wsId} userId={userId} userName={userName} />
    </Suspense>
  ) : undefined;

  return (
    <>
      <PageHeader title="RFP" count={rfps.length} action={newRfpAction} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar statusOptions={STATUS_OPTIONS} gradeOptions={GRADE_OPTIONS} />
        <BoardViewToggle view={view} cookieName="rfpBoardView" tableCount={rfps.length} />
      </div>
      <SplitView list={listContent} panel={panel} />
    </>
  );
}

async function RfpBoardView({ wsId, visibleIds }: { wsId: string; visibleIds: Set<string> }) {
  const board = await loadBoard({ workspaceId: wsId, workspaceType: 'buyer', kind: 'pipeline' });
  const cards = board.cards.filter((c) => visibleIds.has(c.cardId));
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <PipelineBoard cardType="rfp" columns={board.columns} cards={cards} />
    </div>
  );
}
