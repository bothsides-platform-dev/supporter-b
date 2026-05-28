import { PeekPanelHeader } from '@/components/ui/peek-panel-header';
import { RfpDetailContent } from '@/components/rfp/RfpDetailContent';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';
import { loadBoard } from '@/lib/server/board/loadBoard';

interface RfpPeekPanelProps {
  rfpCode: string;
  wsId: string;
  userId: string;
  userName: string;
}

export async function RfpPeekPanel({ rfpCode, wsId, userId, userName }: RfpPeekPanelProps) {
  const data = await loadBuyerRfpDetail({
    code: rfpCode,
    workspaceId: wsId,
    userId,
    userName,
  });

  if (!data) {
    return (
      <div className="flex flex-col h-full">
        <PeekPanelHeader rfpCode={rfpCode} fullscreenHref={`/rfp/${rfpCode}`} />
        <div className="px-8 py-8">
          <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
            RFP를 찾을 수 없습니다.
          </p>
        </div>
      </div>
    );
  }

  const board = await loadBoard({
    workspaceId: data.rfp.buyerWsId,
    workspaceType: 'buyer',
    kind: 'rfp_bids',
    scope: { rfpId: data.rfp.id },
  });

  return (
    <div className="flex flex-col h-full">
      <PeekPanelHeader rfpCode={rfpCode} fullscreenHref={`/rfp/${rfpCode}`} />
      <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10">
        <RfpDetailContent data={data} boardColumns={board.columns} boardCards={board.cards} />
      </div>
    </div>
  );
}

export function RfpPeekPanelSkeleton({ rfpCode }: { rfpCode: string }) {
  return (
    <div className="flex flex-col h-full">
      <PeekPanelHeader rfpCode={rfpCode} fullscreenHref={`/rfp/${rfpCode}`} />
      <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10">
        <RfpDetailContent.Skeleton />
      </div>
    </div>
  );
}
