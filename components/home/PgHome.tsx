import { EmptyState } from '@/components/primitives/EmptyState';
import { PageEnter } from '@/components/primitives/PageEnter';
import { InboxIcon } from '@/components/icons';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { PipelineBoard } from '@/components/board/PipelineBoard';

export async function PgHome({ workspaceId }: { workspaceId: string }) {
  const { columns, cards } = await loadBoard({
    workspaceId,
    workspaceType: 'pg',
    kind: 'pipeline',
  });

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
      <PipelineBoard cardType="invitation" columns={columns} cards={cards} />
    </PageEnter>
  );
}
