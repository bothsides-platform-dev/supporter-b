import { EmptyState } from '@/components/primitives/EmptyState';
import { PageEnter } from '@/components/primitives/PageEnter';
import { InboxIcon } from '@/components/icons';
import { getPgKanbanData } from '@/lib/server/pg-kanban-loader';
import { KanbanBoard } from './KanbanBoard';

export async function PgHome({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const cards = await getPgKanbanData(workspaceId);

  if (cards.length === 0) {
    return (
      <PageEnter className="px-8 py-10">
        <EmptyState
          icon={<InboxIcon size={32} />}
          title="받은 제안 요청이 없습니다."
          description="구매사가 초대한 RFP가 이 화면에 표시됩니다."
        />
      </PageEnter>
    );
  }

  return (
    <PageEnter className="px-8 py-10">
      <KanbanBoard role="pg" cards={cards} />
    </PageEnter>
  );
}
