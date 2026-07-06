import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { requirePgPage } from '@/lib/auth/page-guards';
import { loadPgInboxData, pgInboxDataToRows, type PgInboxData } from '@/lib/server/board/pgInbox';
import { loadPgPipelineBoard } from '@/lib/server/board/loadBoard';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import { InboxList, InboxListSkeleton } from '@/components/inbox/InboxList';
import { PipelineBoard } from '@/components/board/PipelineBoard';
import { BoardViewToggle } from '@/components/board/BoardViewToggle';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';
import {
  filterInboxRows,
  paramsForView,
  resolveBoardView,
  type BoardView,
  type BoardFilterParams,
} from '@/lib/server/board/filterRfps';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'new', label: '신규' },
  { value: 'submitted', label: '견적 보냄' },
  { value: 'closed', label: '마감' },
];
const GRADE_OPTIONS = Object.entries(MERCHANT_TIER_LABELS).map(([value, label]) => ({ value, label }));

type Props = {
  searchParams: Promise<{ status?: string; deadline?: string; grade?: string; view?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const session = await requirePgPage('/inbox');

  const sp = await searchParams;
  const cookieStore = await cookies();
  const view = resolveBoardView(sp.view, cookieStore.get('inboxBoardView')?.value);

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title="받은 견적 요청" />
            <InboxListSkeleton />
          </>
        }
      >
        <InboxListPageLoader wsId={session.user.workspaceId} params={sp} view={view} />
      </Suspense>
    </div>
  );
}

async function InboxListPageLoader({
  wsId,
  params,
  view,
}: {
  wsId: string;
  params: BoardFilterParams;
  view: BoardView;
}) {
  const now = new Date();
  // 3-쿼리 조립의 단일 출처 — pgInboxDataToRows·buildPgPipelineCards 양쪽이 동일 데이터 소비.
  const pgData = await loadPgInboxData(wsId);
  const allRows = pgInboxDataToRows(pgData);
  const rows = filterInboxRows(allRows, paramsForView(params, view), now);

  // 행 클릭은 딜룸 모달(인터셉트 라우트)을 띄운다 — 과거 ?peek 사이드 패널은 제거됨.
  const listContent =
    rows.length === 0 ? (
      <div className="space-y-4 px-6 pt-4">
        <EmptyState
          icon={<InboxIcon size={32} />}
          title="아직 받은 견적 요청이 없어요."
          description="필터를 바꾸면 견적 요청을 볼 수 있어요. 구매사가 초대한 견적 요청이 여기에 표시돼요."
        />
      </div>
    ) : view === 'board' ? (
      <InboxBoardView
        wsId={wsId}
        visibleIds={new Set(rows.map((r) => r.invitationId))}
        pgData={pgData}
      />
    ) : (
      <InboxList rows={rows} />
    );

  return (
    <>
      <PageHeader title="받은 견적 요청" count={rows.length} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar
          statusOptions={STATUS_OPTIONS}
          gradeOptions={GRADE_OPTIONS}
          hideStatus={view === 'board'}
        />
        <BoardViewToggle view={view} cookieName="inboxBoardView" tableCount={rows.length} />
      </div>
      {listContent}
    </>
  );
}

async function InboxBoardView({
  wsId,
  visibleIds,
  pgData,
}: {
  wsId: string;
  visibleIds: Set<string>;
  pgData: PgInboxData;
}) {
  // prefetched pgData 를 재사용 — 동일 3-쿼리를 보드 뷰에서 다시 실행하지 않는다.
  const board = await loadPgPipelineBoard(wsId, pgData);
  const cards = board.cards.filter((c) => visibleIds.has(c.cardId));
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <PipelineBoard cardType="invitation" columns={board.columns} cards={cards} />
    </div>
  );
}
