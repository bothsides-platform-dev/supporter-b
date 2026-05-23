import { PageEnter } from '@/components/primitives/PageEnter';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { PipelineBoard } from '@/components/board/PipelineBoard';

export async function BuyerHome({ workspaceId }: { workspaceId: string }) {
  const { columns, cards } = await loadBoard({
    workspaceId,
    workspaceType: 'buyer',
    kind: 'pipeline',
  });

  return (
    <PageEnter className="px-8 py-10">
      <PipelineBoard cardType="rfp" columns={columns} cards={cards} />
    </PageEnter>
  );
}
