import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { getInvitationRepo } from '@/lib/server/repositories/factory';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { InboxList, InboxListSkeleton, type InboxRow } from '@/components/inbox/InboxList';
import { PipelineBoard } from '@/components/board/PipelineBoard';
import { BoardViewToggle } from '@/components/board/BoardViewToggle';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';
import {
  filterInboxRows,
  resolveBoardView,
  type BoardView,
  type BoardFilterParams,
} from '@/lib/server/board/filterRfps';

export const dynamic = 'force-dynamic';

const GRADE_OPTIONS = Object.entries(GRADE_LABELS).map(([value, label]) => ({ value, label }));

type Props = {
  searchParams: Promise<{ status?: string; deadline?: string; grade?: string; view?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/inbox');
  }

  const sp = await searchParams;
  const cookieStore = await cookies();
  const view = resolveBoardView(sp.view, cookieStore.get('inboxBoardView')?.value);

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title="받은 RFP" />
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
  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(wsId);

  const allRows: InboxRow[] = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpStatus: rfp.status,
    rfpId: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
    grade: rfp.bizProfile?.grade ? GRADE_LABELS[rfp.bizProfile.grade] : '—',
    gradeRaw: rfp.bizProfile?.grade,
  }));
  const rows = filterInboxRows(allRows, params, now);

  return (
    <>
      <PageHeader title="받은 RFP" count={rows.length} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar gradeOptions={GRADE_OPTIONS} />
        <BoardViewToggle view={view} cookieName="inboxBoardView" tableCount={rows.length} />
      </div>
      {view === 'board' ? (
        <InboxBoardView wsId={wsId} visibleIds={new Set(rows.map((r) => r.invitationId))} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<InboxIcon size={32} />}
          title="조건에 맞는 제안 요청이 없습니다."
          description="필터를 바꾸세요. 구매사가 초대한 RFP가 여기에 표시됩니다."
        />
      ) : (
        <InboxList rows={rows} />
      )}
    </>
  );
}

async function InboxBoardView({ wsId, visibleIds }: { wsId: string; visibleIds: Set<string> }) {
  const board = await loadBoard({ workspaceId: wsId, workspaceType: 'pg', kind: 'pipeline' });
  const cards = board.cards.filter((c) => visibleIds.has(c.cardId));
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <PipelineBoard cardType="invitation" columns={board.columns} cards={cards} />
    </div>
  );
}
