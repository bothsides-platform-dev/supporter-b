'use client';

/**
 * BuyerDealRoomBody — 구매사 딜룸 본문(좌측 액션 레일 + 가운데 탭).
 *
 * 탭: 견적비교(FocusComparison) · 요청조건(RequestConditionsView) · 첨부 · PG관리.
 * 레일: 선정·재요청(포커스 PG 대상 다이얼로그) · PG관리·요청조건·첨부(탭 전환) ·
 *       마감·취소(ConfirmDialog → close/cancel 액션).
 *
 * 선정/재요청 대상은 DealRoom 컨텍스트의 포커스 PG(=FocusComparison 이 set)를
 * 따른다 — 가운데 견적비교 탭에서 PG 를 바꾸면 레일 '선정'도 그 PG 를 겨냥한다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  RefreshCw,
  UserPlus,
  FileText,
  Paperclip,
  Lock,
  XCircle,
} from 'lucide-react';

import { DealRoomActionRail, type RailAction } from '@/components/deal-room/DealRoomActionRail';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { FocusComparison } from '@/components/rfp/comparison/FocusComparison';
import { RequestConditionsView } from '@/components/rfp/RequestConditionsView';
import { SampleRfpBanner } from '@/components/rfp/SampleRfpBanner';
import { RfpInviteManager } from '@/components/rfp/RfpInviteManager';
import { RfpBoardVisibilityToggle } from '@/components/rfp/RfpBoardVisibilityToggle';
import { RfpPendingRequests } from '@/components/rfp/RfpPendingRequests';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { AwardConfirmDialog } from '@/components/rfp/comparison/AwardConfirmDialog';
import { RequoteDialog } from '@/components/rfp/comparison/RequoteDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { closeRfpAction, cancelRfpAction } from '@/lib/server/actions/rfp';
import { useDealRoom } from '@/components/deal-room/DealRoomContext';
import { toast } from '@/lib/toast';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';

export function BuyerDealRoomBody({ data }: { data: BuyerRfpDetailData }) {
  const {
    rfp,
    bids,
    rfpFiles,
    pgWsNameMap,
    inviteList,
    pendingRequests,
    canEdit,
    requoteByPg,
  } = data;
  const router = useRouter();
  const [tab, setTab] = useState('compare');
  const [awardOpen, setAwardOpen] = useState(false);
  const [requoteOpen, setRequoteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const focusedWsId = useDealRoom().counterparty?.workspaceId;
  // 선정 대상은 가운데 FocusComparison 이 publish 한 포커스 PG 만 따른다. 아직
  // publish 전(첫 프레임)엔 undefined → 선정 비활성 — 정렬순 기본값(bids[0])을
  // 추측해 하이라이트와 다른 견적을 겨냥하는 일을 막는다.
  const focusedBid = focusedWsId
    ? bids.find((b) => b.pgWsId === focusedWsId)
    : undefined;
  const pgName = (wsId?: string) => (wsId ? (pgWsNameMap[wsId] ?? wsId) : '');
  const canAward = rfp.status === 'sent' && !rfp.isSample;
  const isOpenStatus = rfp.status === 'sent';

  const tabs: DealRoomTab[] = [
    {
      id: 'compare',
      label: '견적 비교',
      content: (
        <FocusComparison
          bids={bids}
          pgWsNameMap={pgWsNameMap}
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
          isSample={rfp.isSample ?? false}
          hideHeader
        />
      ),
    },
    { id: 'request', label: '요청 조건', content: <RequestConditionsView data={data} /> },
    { id: 'attach', label: '첨부', content: <AttachmentPreviewList files={rfpFiles} /> },
    {
      id: 'manage',
      label: 'PG 관리',
      content: (
        <div className="space-y-6">
          <RfpInviteManager rfpId={rfp.code} invitations={inviteList} canEdit={canEdit} />
          <RfpBoardVisibilityToggle
            rfpCode={rfp.code}
            boardVisible={rfp.boardVisible ?? true}
            canEdit={canEdit}
          />
          <RfpPendingRequests requests={pendingRequests} canEdit={canEdit} />
        </div>
      ),
    },
  ];

  const actions: RailAction[] = [
    {
      id: 'award',
      label: '선정',
      icon: <Check />,
      primary: true,
      disabled: !canAward || !focusedBid,
      onSelect: () => setAwardOpen(true),
    },
    {
      id: 'requote',
      label: '재요청',
      icon: <RefreshCw />,
      disabled: !canAward || bids.length === 0,
      onSelect: () => setRequoteOpen(true),
    },
    { id: 'manage', label: 'PG 관리', icon: <UserPlus />, onSelect: () => setTab('manage') },
    { id: 'request', label: '요청 조건', icon: <FileText />, onSelect: () => setTab('request') },
    { id: 'attach', label: '첨부', icon: <Paperclip />, onSelect: () => setTab('attach') },
    {
      id: 'close',
      label: '마감',
      icon: <Lock />,
      disabled: !isOpenStatus,
      onSelect: () => setCloseOpen(true),
    },
    {
      id: 'cancel',
      label: '취소',
      icon: <XCircle />,
      danger: true,
      disabled: !isOpenStatus,
      onSelect: () => setCancelOpen(true),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {rfp.isSample && (
        <div className="shrink-0 px-6 pt-4">
          <SampleRfpBanner rfpCode={rfp.code} />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
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
        title="견적 요청을 마감할까요?"
        description="마감하면 더 이상 새 견적을 받을 수 없어요."
        confirmLabel="마감"
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
