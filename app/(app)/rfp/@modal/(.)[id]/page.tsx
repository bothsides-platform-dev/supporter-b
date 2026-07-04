// 구매사 견적 딜룸 — 인터셉트 모달(@modal 슬롯). 목록에서 /rfp/<code> 로 soft-nav
// 하면 이 페이지가 목록 위 모달로 뜬다. 정식 페이지(app/(app)/rfp/[id]/page.tsx)와
// 동일한 가드·로더를 쓰고 같은 본문(RfpDetailContent)을 감싸 시각이 일치한다.
// 새로고침/딥링크는 인터셉터를 건너뛰어 정식 페이지가 풀스크린으로 렌더된다.
import { Chip } from '@/components/primitives/Chip';
import { RfpBoardVisibilityStatus } from '@/components/rfp/RfpBoardVisibilityStatus';
import { DealRoomModal } from '@/components/deal-room/DealRoomModal';
import { DealRoomChat } from '@/components/deal-room/DealRoomChat';
import { buyerClosedCounterpartyIds } from '@/lib/rfp/closed-counterparties';
import { BuyerDealRoomBody } from '@/components/deal-room/buyer/BuyerDealRoomBody';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';
import { rfpStatusChip } from '@/lib/rfp-status';
import { SampleBuyerDealRoom } from '@/components/onboarding/SampleBuyerDealRoom';
import { SAMPLE_RFP_CODE, sampleBuyerRfp } from '@/lib/onboarding/fixtures';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RfpDealRoomModalPage({ params }: Props) {
  const { id } = await params;
  const session = await requireBuyerPage(`/rfp/${id}`);

  // 가상 샘플 온보딩 — DB 행 없이 fixture 로 딜룸을 재현한다. 로더·DB 접근 전부 건너뛴다.
  if (id === SAMPLE_RFP_CODE) {
    return (
      <DealRoomModal code={sampleBuyerRfp.code} title={sampleBuyerRfp.title}>
        <SampleBuyerDealRoom />
      </DealRoomModal>
    );
  }

  const { workspaceId, id: userId, name, email } = session.user;

  const data = await loadBuyerRfpDetail({
    code: id,
    workspaceId,
    userId,
    userName: name ?? email ?? '구매사 담당자',
  });
  // 삭제됐거나 접근 불가한 코드(이전/다음 stale·다른 탭 삭제 등) — 빈 오버레이 대신
  // 닫을 수 있는 모달에 안내를 띄운다.
  if (!data) {
    return (
      <DealRoomModal code={id} title="견적 요청을 찾을 수 없어요">
        <div className="flex h-full items-center justify-center p-8 text-center">
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            이미 삭제됐거나 접근할 수 없는 견적 요청이에요.
          </p>
        </div>
      </DealRoomModal>
    );
  }

  const s = rfpStatusChip(data.rfp.status);

  return (
    <DealRoomModal
      code={data.rfp.code}
      title={data.rfp.title}
      statusChip={
        <>
          {s ? <Chip label={s.label} color={s.color} /> : null}
          <RfpBoardVisibilityStatus boardVisible={data.rfp.boardVisible ?? true} />
        </>
      }
      chat={
        <DealRoomChat
          rfpId={data.rfp.id}
          rfpCode={data.rfp.code}
          rfpTitle={data.rfp.title}
          closedCounterpartyIds={buyerClosedCounterpartyIds(data.rfp, data.bids)}
        />
      }
    >
      <BuyerDealRoomBody data={data} />
    </DealRoomModal>
  );
}
