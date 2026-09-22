'use client';

/**
 * BuyerDealRoomBody — 구매사 딜룸 본문(좌측 작업 레일 + 가운데 탭).
 *
 * 탭: 견적비교(FocusComparison) · 요청조건(RequestConditionsView) · 첨부 · PG관리.
 * 레일: 선정·재요청(포커스 PG 대상 다이얼로그) · 마감·취소
 *       (ConfirmDialog → close/cancel 액션). 콘텐츠 이동은 상단 탭만 소유한다.
 *
 * 선정/재요청 대상은 DealRoom 컨텍스트의 포커스 PG(=FocusComparison 이 set)를
 * 따른다 — 가운데 견적비교 탭에서 PG 를 바꾸면 레일 '선정'도 그 PG 를 겨냥한다.
 */
import { BuyerMatchingStatus } from '@/components/rfp/MatchingStatus';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  RefreshCw,
  Lock,
  XCircle,
} from 'lucide-react';

import { DealRoomActionRail, type RailAction } from '@/components/deal-room/DealRoomActionRail';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { FocusComparison } from '@/components/rfp/comparison/FocusComparison';
import { RequestConditionsView } from '@/components/rfp/RequestConditionsView';
import { RfpInviteManager } from '@/components/rfp/RfpInviteManager';
import { RfpBoardVisibilityStatus } from '@/components/rfp/RfpBoardVisibilityStatus';
import { Label } from '@/components/primitives/Label';
import { RfpPendingRequests } from '@/components/rfp/RfpPendingRequests';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { AwardConfirmDialog } from '@/components/rfp/comparison/AwardConfirmDialog';
import { RequoteDialog } from '@/components/rfp/comparison/RequoteDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { closeRfpAction, cancelRfpAction } from '@/lib/server/actions/rfp';
import { useDealRoom } from '@/components/deal-room/DealRoomContext';
import { ContactBlock } from '@/components/deal-room/ContactBlock';
import { DealResultHeader } from '@/components/deal-room/DealResultHeader';
import { SigningSummaryStrip } from '@/components/deal-room/signing/SigningSummaryStrip';
import { buildContractTabEntries } from '@/components/deal-room/signing/build-contract-tab-entries';
import { josa } from 'es-hangul';
import { toast } from '@/lib/toast';
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';

export function BuyerDealRoomBody({
  data,
  onGuestAction,
}: {
  data: BuyerRfpDetailData;
  /**
   * 랜딩 데모(비로그인) 전용 탈출구 — 주어지면 선정·재요청·종료·취소가 확인
   * 다이얼로그와 서버 액션 대신 이 콜백(가입 유도)으로 빠진다. 실제 앱에서는
   * 주지 않으며, 없으면 평소 동작 그대로다.
   */
  onGuestAction?: () => void;
}) {
  const {
    rfp,
    bids,
    rfpFiles,
    pgWsById,
    inviteList,
    pendingRequests,
    canEdit,
    requoteByPg,
    awardedPgContact,
    signing,
  } = data;
  const router = useRouter();
  const [tab, setTab] = useState(signing ? 'contract' : 'compare');
  const [awardOpen, setAwardOpen] = useState(false);
  const [requoteOpen, setRequoteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { counterparty, setCounterparty } = useDealRoom();
  const focusedWsId = counterparty?.workspaceId;
  const pendingReview = bids.length === 0 ? data.matching?.reviews.at(-1) : undefined;
  const pendingPgId = pendingReview?.pgWorkspaceId;
  const pendingPgName = pendingPgId ? pgWsById[pendingPgId]?.name ?? pendingReview?.candidate.name : undefined;
  const pendingPgLogo = pendingPgId ? pgWsById[pendingPgId]?.logoUpdatedAt ?? null : null;
  useEffect(() => {
    if (pendingPgId && pendingPgName) {
      setCounterparty({ workspaceId: pendingPgId, name: pendingPgName, type: 'pg', logoUpdatedAt: pendingPgLogo });
    }
  }, [pendingPgId, pendingPgName, pendingPgLogo, setCounterparty]);
  // 선정 대상은 가운데 FocusComparison 이 publish 한 포커스 PG 만 따른다. 아직
  // publish 전(첫 프레임)엔 undefined → 선정 비활성 — 정렬순 기본값(bids[0])을
  // 추측해 하이라이트와 다른 견적을 겨냥하는 일을 막는다.
  const focusedBid = focusedWsId
    ? bids.find((b) => b.pgWsId === focusedWsId)
    : undefined;
  const awardedPgWsId = rfp.awardedBidId
    ? bids.find((b) => b.id === rfp.awardedBidId)?.pgWsId
    : undefined;
  const pgName = (wsId?: string) => (wsId ? (pgWsById[wsId]?.name ?? wsId) : '');
  const canAward = rfp.status === 'sent';
  const isOpenStatus = rfp.status === 'sent';
  const invitedPgCount = inviteList.filter(({ status }) => status !== 'draft').length;
  const draftPgCount = inviteList.length - invitedPgCount;

  const contractTabs = buildContractTabEntries({
    rfpCode: rfp.code,
    signing,
    side: 'buyer',
    contact: awardedPgContact,
    counterpartyWsId: awardedPgWsId,
  });

  const tabs: DealRoomTab[] = [
    ...contractTabs,
    {
      id: 'compare',
      label: data.matching && bids.length === 0 ? '상담 진행' : '견적 비교',
      content: (
        <>
          {rfp.status === 'awarded' && awardedPgContact && (
            <div className="mb-4">
              <DealResultHeader
                tone="award"
                title={`${josa(awardedPgContact.workspaceName, '을/를')} 선정했어요`}
                subtitle="담당처와 연락을 이어나가보세요."
              >
                <ContactBlock contact={awardedPgContact} counterpartyKind="pg" />
              </DealResultHeader>
            </div>
          )}
          {signing && (
            <SigningSummaryStrip signing={signing} side="buyer" onOpen={() => setTab('contract')} />
          )}
          {data.matching && <BuyerMatchingStatus rfpId={rfp.id} rfpCode={rfp.code} deadline={rfp.deadline} status={rfp.status} data={data.matching} />}
          {(!data.matching || bids.length > 0) && <FocusComparison
            bids={bids}
            pgWsById={pgWsById}
            current={{
              feeRate: rfp.currentFeeRate,
              settlementCycle: rfp.currentSettlementCycle,
              settlementLimit: rfp.currentSettlementLimit,
              guaranteeInsurance: rfp.currentGuaranteeInsurance,
            }}
            rfpStatus={rfp.status}
            awardedBidId={rfp.awardedBidId}
            requiredPaymentMethods={rfp.requiredPaymentMethods}
            customPaymentMethods={rfp.customPaymentMethods}
            rfpId={rfp.id}
            rfpCode={rfp.code}
            requoteByPg={requoteByPg}
            buyerGrade={rfp.bizProfile?.grade}
            invitedPgCount={invitedPgCount}
            draftPgCount={draftPgCount}
            deadline={rfp.deadline}
            canEditInvitations={canEdit && !data.matching}
            onManageInvitations={() => setTab('manage')}
            onSampleAward={onGuestAction && (() => onGuestAction())}
            hideHeader
          />}
        </>
      ),
    },
    { id: 'request', label: '요청 조건', content: <RequestConditionsView data={data} /> },
    { id: 'attach', label: '첨부', content: <AttachmentPreviewList files={rfpFiles} /> },
    {
      id: 'manage',
      label: 'PG 관리',
      content: (
        <div className="space-y-6">
          <RfpInviteManager rfpId={rfp.code} invitations={inviteList} canEdit={canEdit && !data.matching} />
          {OPEN_BOARD_ENABLED && (
            <div className="flex items-center justify-between gap-3">
              <Label size="md" muted={false}>오픈 게시판 노출</Label>
              <RfpBoardVisibilityStatus boardVisible={rfp.boardVisible ?? true} />
            </div>
          )}
          <RfpPendingRequests requests={pendingRequests} canEdit={canEdit && !data.matching} />
        </div>
      ),
    },
  ];

  const actions: RailAction[] = [
    ...(bids.length > 0
      ? [
          {
            id: 'award',
            label: '선정',
            icon: <Check />,
            primary: true,
            // 데모에서는 포커스 PG 가 아직 publish 되지 않아도 눌러볼 수 있어야
            // 한다(어차피 가입으로 빠진다).
            disabled: !canAward || (!onGuestAction && !focusedBid),
            onSelect: () => (onGuestAction ? onGuestAction() : setAwardOpen(true)),
          },
          {
            id: 'requote',
            label: '재요청',
            icon: <RefreshCw />,
            disabled: !canAward,
            onSelect: () => (onGuestAction ? onGuestAction() : setRequoteOpen(true)),
          },
        ] satisfies RailAction[]
      : []),
    {
      id: 'close',
      label: '선정 없이 종료',
      icon: <Lock />,
      placement: 'bottom',
      disabled: !isOpenStatus,
      onSelect: () => (onGuestAction ? onGuestAction() : setCloseOpen(true)),
    },
    {
      id: 'cancel',
      label: '취소',
      icon: <XCircle />,
      danger: true,
      placement: 'bottom',
      disabled: !isOpenStatus,
      onSelect: () => (onGuestAction ? onGuestAction() : setCancelOpen(true)),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <DealRoomActionRail actions={actions} />
        <div className="min-w-0 flex-1">
          <DealRoomCenter tabs={tabs} activeId={tab} onChange={setTab} />
        </div>
      </div>

      {focusedBid && (
        <AwardConfirmDialog
          open={awardOpen}
          onOpenChange={setAwardOpen}
          rfpId={rfp.id}
          awardedBidId={focusedBid.id}
          pgName={pgName(focusedBid.pgWsId)}
          otherCount={bids.length - 1}
          selectedBid={focusedBid}
          buyerGrade={rfp.bizProfile?.grade}
          onAwarded={() => router.refresh()}
        />
      )}
      <RequoteDialog
        open={requoteOpen}
        onOpenChange={setRequoteOpen}
        rfpId={rfp.id}
        candidates={bids.map((b) => ({ pgWsId: b.pgWsId, name: pgName(b.pgWsId) }))}
        onRequested={() => router.refresh()}
      />
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={(o) => !busy && setCloseOpen(o)}
        title="선정 없이 견적 요청을 종료할까요?"
        description="종료하면 받은 견적을 선정하거나 새 견적을 받을 수 없어요. 이 요청은 다시 열 수 없어요. 받은 견적 중에서 선정하려면 이 창을 닫고 비교를 이어가세요."
        confirmLabel="선정 없이 종료할게요"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const r = await closeRfpAction({ rfpId: rfp.code });
          setBusy(false);
          if (!r.ok) {
            toast(`마감하지 못했어요 — ${r.error}`, { type: 'error' });
            return;
          }
          setCloseOpen(false);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(o) => !busy && setCancelOpen(o)}
        title="견적 요청을 취소할까요?"
        description="취소하면 초대한 PG에게 취소 사실이 전달돼요."
        confirmLabel="취소하기"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const r = await cancelRfpAction({ rfpId: rfp.code });
          setBusy(false);
          if (!r.ok) {
            toast(`취소하지 못했어요 — ${r.error}`, { type: 'error' });
            return;
          }
          setCancelOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
