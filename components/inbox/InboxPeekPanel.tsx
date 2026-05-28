// InboxPeekPanel — PG 인박스 피크 패널 (Server Component).
// 피크 패널 슬롯에서 rfpCode + wsId 를 받아 loadPgRfpDetail 로 데이터를 로드한다.
import { PeekPanelHeader } from '@/components/ui/peek-panel-header';
import { PgRfpDetailContent } from '@/components/inbox/PgRfpDetailContent';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';

interface InboxPeekPanelProps {
  rfpCode: string;
  wsId: string;
}

export async function InboxPeekPanel({ rfpCode, wsId }: InboxPeekPanelProps) {
  const data = await loadPgRfpDetail({ code: rfpCode, workspaceId: wsId });

  if (!data) {
    return (
      <div className="flex flex-col h-full">
        <PeekPanelHeader rfpCode={rfpCode} fullscreenHref={`/inbox/${rfpCode}`} />
        <div className="px-8 py-8">
          <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
            RFP를 찾을 수 없습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PeekPanelHeader rfpCode={rfpCode} fullscreenHref={`/inbox/${rfpCode}`} />
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <PgRfpDetailContent data={data} />
      </div>
    </div>
  );
}

export function InboxPeekPanelSkeleton({ rfpCode }: { rfpCode: string }) {
  return (
    <div className="flex flex-col h-full">
      <PeekPanelHeader rfpCode={rfpCode} fullscreenHref={`/inbox/${rfpCode}`} />
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <PgRfpDetailContent.Skeleton />
      </div>
    </div>
  );
}
