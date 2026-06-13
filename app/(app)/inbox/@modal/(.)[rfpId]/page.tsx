// PG 견적 딜룸 — 인터셉트 모달(@modal 슬롯). 목록에서 /inbox/<code> 로 soft-nav
// 하면 목록 위 모달로 뜬다. 정식 페이지(app/(app)/inbox/[rfpId]/page.tsx)와 동일한
// auth·loadPgRfpDetail(markOpened 부수효과 포함)을 쓰고 MarkInboxViewed 도 함께
// 마운트해 "열람" 신호를 보존한다.
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { DealRoomModal } from '@/components/deal-room/DealRoomModal';
import { PgRfpDetailContent } from '@/components/inbox/PgRfpDetailContent';
import { MarkInboxViewed } from '@/components/inbox/MarkInboxViewed';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ rfpId: string }> };

export default async function InboxDealRoomModalPage({ params }: Props) {
  const { rfpId: rfpCode } = await params;

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}`);
  }

  const data = await loadPgRfpDetail({ code: rfpCode, workspaceId: session.user.workspaceId });
  if (!data) notFound();

  const chip: { label: string; color: ChipColor } = data.pendingRequote
    ? { label: '재요청', color: 'warning' }
    : data.myBid
      ? { label: '견적 보냄', color: 'tertiary' }
      : { label: '신규', color: 'warning' };

  return (
    <>
      <MarkInboxViewed rfpId={rfpCode} />
      <DealRoomModal
        code={data.rfp.code}
        title={data.rfp.title}
        fullscreenHref={`/inbox/${data.rfp.code}`}
        statusChip={<Chip label={chip.label} color={chip.color} />}
      >
        <div className="px-6 py-6">
          <PgRfpDetailContent data={data} variant="full" />
        </div>
      </DealRoomModal>
    </>
  );
}
