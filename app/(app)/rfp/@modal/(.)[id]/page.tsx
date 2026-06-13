// 구매사 견적 딜룸 — 인터셉트 모달(@modal 슬롯). 목록에서 /rfp/<code> 로 soft-nav
// 하면 이 페이지가 목록 위 모달로 뜬다. 정식 페이지(app/(app)/rfp/[id]/page.tsx)와
// 동일한 가드·로더를 쓰고 같은 본문(RfpDetailContent)을 감싸 시각이 일치한다.
// 새로고침/딥링크는 인터셉터를 건너뛰어 정식 페이지가 풀스크린으로 렌더된다.
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { DealRoomModal } from '@/components/deal-room/DealRoomModal';
import { DealRoomChat } from '@/components/deal-room/DealRoomChat';
import { BuyerDealRoomBody } from '@/components/deal-room/buyer/BuyerDealRoomBody';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const STATUS: Record<string, { label: string; color: ChipColor }> = {
  draft: { label: '임시저장', color: 'surface' },
  sent: { label: '요청 보냄', color: 'warning' },
  closed: { label: '마감', color: 'surface' },
  awarded: { label: '선정 완료', color: 'tertiary' },
  cancelled: { label: '취소', color: 'error' },
};

export default async function RfpDealRoomModalPage({ params }: Props) {
  const { id } = await params;
  const session = await requireBuyerPage(`/rfp/${id}`);
  const { workspaceId, id: userId, name, email } = session.user;

  const data = await loadBuyerRfpDetail({
    code: id,
    workspaceId,
    userId,
    userName: name ?? email ?? '구매사 담당자',
  });
  if (!data) return null;

  const s = STATUS[data.rfp.status];

  return (
    <DealRoomModal
      code={data.rfp.code}
      title={data.rfp.title}
      fullscreenHref={`/rfp/${data.rfp.code}`}
      statusChip={s ? <Chip label={s.label} color={s.color} /> : undefined}
      chat={
        <DealRoomChat
          rfpId={data.rfp.id}
          rfpCode={data.rfp.code}
          rfpTitle={data.rfp.title}
          isSample={data.rfp.isSample}
        />
      }
    >
      <BuyerDealRoomBody data={data} />
    </DealRoomModal>
  );
}
