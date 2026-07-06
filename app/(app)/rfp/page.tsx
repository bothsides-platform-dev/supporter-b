import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FileTextIcon, PlusIcon } from '@/components/icons';
import { RfpListTable, RfpListTableSkeleton } from '@/components/rfp/RfpListTable';
import { PipelineBoard } from '@/components/board/PipelineBoard';
import { BoardViewToggle } from '@/components/board/BoardViewToggle';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { getRfpRepo, getUserRepo } from '@/lib/server/repositories/factory';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { filterRfps, paramsForView, resolveBoardView, type BoardView, type BoardFilterParams } from '@/lib/server/board/filterRfps';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import { SampleEntryCard } from '@/components/onboarding/SampleEntryCard';
import { shouldShowSampleEntry } from '@/lib/onboarding/visibility';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '마감' },
];
const GRADE_OPTIONS = Object.entries(MERCHANT_TIER_LABELS).map(([value, label]) => ({ value, label }));

type Props = {
  searchParams: Promise<{ status?: string; deadline?: string; grade?: string; view?: string }>;
};

export default async function RfpListPage({ searchParams }: Props) {
  const session = await requireBuyerPage('/rfp');

  const sp = await searchParams;
  const cookieStore = await cookies();
  const view = resolveBoardView(sp.view, cookieStore.get('rfpBoardView')?.value);
  const wsId = session.user.workspaceId;

  const newRfpAction = (
    <Link href="/rfp-create">
      <Button size="sm" icon={<PlusIcon />}>
        견적 요청하기
      </Button>
    </Link>
  );

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title="견적 요청" action={newRfpAction} />
            <RfpListTableSkeleton />
          </>
        }
      >
        <RfpListPageLoader wsId={wsId} userId={session.user.id} params={sp} view={view} newRfpAction={newRfpAction} />
      </Suspense>
    </div>
  );
}

async function RfpListPageLoader({
  wsId,
  userId,
  params,
  view,
  newRfpAction,
}: {
  wsId: string;
  userId: string;
  params: BoardFilterParams;
  view: BoardView;
  newRfpAction: React.ReactNode;
}) {
  const now = new Date();
  const allRfps = await (await getRfpRepo()).findByBuyerWs(wsId);
  const rfps = filterRfps(allRfps, paramsForView(params, view), now);

  const onboarding = await (await getUserRepo()).getOnboarding(userId);
  const showSampleEntry = shouldShowSampleEntry(onboarding, 'buyerSample');

  // 행 클릭은 딜룸 모달(인터셉트 라우트)을 띄운다 — 과거 ?peek 사이드 패널은 제거됨.
  const listContent =
    rfps.length === 0 ? (
      <div className="space-y-4 px-6 pt-4">
        {showSampleEntry && <SampleEntryCard variant="buyer" />}
        <EmptyState
          icon={<FileTextIcon size={32} />}
          title="아직 보낸 견적 요청이 없어요."
          description="필터를 바꾸거나 첫 견적 요청을 보내보세요."
        />
      </div>
    ) : view === 'board' ? (
      <RfpBoardView wsId={wsId} visibleIds={new Set(rfps.map((r) => r.id))} />
    ) : (
      <RfpListTable rfps={rfps} />
    );

  return (
    <>
      <PageHeader title="견적 요청" count={rfps.length} action={newRfpAction} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar
          statusOptions={STATUS_OPTIONS}
          gradeOptions={GRADE_OPTIONS}
          hideStatus={view === 'board'}
        />
        <BoardViewToggle view={view} cookieName="rfpBoardView" tableCount={rfps.length} />
      </div>
      {showSampleEntry && rfps.length > 0 && (
        <div className="px-6 pt-3">
          <SampleEntryCard variant="buyer" />
        </div>
      )}
      {listContent}
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
