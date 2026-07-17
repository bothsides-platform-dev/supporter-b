'use client';

/**
 * PgDealRoomBody — PG 딜룸 본문(좌측 액션 레일 + 가운데 탭).
 *
 * 탭: 견적작성(BidWizard / 재요청 prefill / 제출완료 안내) · 요청조건(RfpBriefPanel)
 *     · 첨부. 레일: 견적작성·요청보기·첨부(탭 전환) · 철회(ConfirmDialog → withdraw).
 */
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, FileText, Paperclip, Undo2 } from 'lucide-react';

import { DealRoomActionRail, type RailAction } from '@/components/deal-room/DealRoomActionRail';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { SubmittedSummary } from '@/components/inbox/SubmittedSummary';
import { buildSubmittedSummaryRows } from '@/components/inbox/buildSubmittedSummaryRows';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { RequoteBanner } from '@/components/inbox/RequoteBanner';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { LocalTime } from '@/components/primitives/LocalTime';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withdrawBidAction } from '@/lib/server/actions/bid/withdrawBidAction';
import { toast } from '@/lib/toast';
import { ContactBlock } from '@/components/deal-room/ContactBlock';
import { DealResultHeader } from '@/components/deal-room/DealResultHeader';
import { ContractDealCard } from '@/components/contracts/ContractDealCard';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

export function PgDealRoomBody({
  data,
  eContractVisible,
}: {
  data: PgRfpDetailData;
  /** 전자계약 마스터 게이트 — 호출 페이지가 isEContractVisible() 로 계산해 내려준다. */
  eContractVisible?: boolean;
}) {
  const { rfp, myBid, buyerName, quoteTemplates, pendingRequote, awardedToMe, buyerContact } = data;
  const router = useRouter();
  const [tab, setTab] = useState('write');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAwarded = rfp.status === 'awarded';
  let writeContent: ReactNode;
  if (pendingRequote) {
    writeContent = (
      <>
        <RequoteBanner message={pendingRequote.message} deadline={pendingRequote.deadline} />
        <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} initialBid={myBid} />
      </>
    );
  } else if (isAwarded && awardedToMe) {
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="award"
          title="이 견적이 선정됐어요"
          subtitle={myBid?.submittedAt ? <>보낸 시각 <LocalTime iso={myBid.submittedAt} /></> : undefined}
        >
          {buyerContact && <ContactBlock contact={buyerContact} counterpartyKind="buyer" />}
        </DealResultHeader>
        {eContractVisible && (
          <ContractDealCard kind="pg" summary={data.contractDocSummary} rfpCode={rfp.code} />
        )}
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(rfp, myBid)} />}
      </div>
    );
  } else if (isAwarded && !awardedToMe) {
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="neutral"
          title="이번엔 선정되지 않았어요"
          subtitle="구매사가 다른 PG를 선정했어요. 보내주신 견적은 잘 전달됐고, 좋은 기회로 다시 만나요."
        />
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(rfp, myBid)} />}
      </div>
    );
  } else if (myBid) {
    writeContent = (
      <div className="space-y-4">
        <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-tertiary)]">
          ✓ 견적을 보냈어요
        </p>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          보낸 시각: {myBid.submittedAt ? <LocalTime iso={myBid.submittedAt} /> : '—'}
        </p>
        <SubmittedSummary rows={buildSubmittedSummaryRows(rfp, myBid)} />
      </div>
    );
  } else {
    writeContent = <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} />;
  }

  const tabs: DealRoomTab[] = [
    { id: 'write', label: '견적 작성', content: writeContent },
    { id: 'request', label: '요청 조건', content: <RfpBriefPanel rfp={rfp} buyerName={buyerName} /> },
    { id: 'attach', label: '첨부', content: <AttachmentPreviewList files={rfp.rfpFiles} /> },
  ];

  const actions: RailAction[] = [
    { id: 'write', label: '견적 작성', icon: <Pencil />, primary: true, onSelect: () => setTab('write') },
    { id: 'request', label: '요청 보기', icon: <FileText />, onSelect: () => setTab('request') },
    { id: 'attach', label: '첨부', icon: <Paperclip />, onSelect: () => setTab('attach') },
    {
      id: 'withdraw',
      label: '철회',
      icon: <Undo2 />,
      danger: true,
      disabled: !myBid,
      onSelect: () => setWithdrawOpen(true),
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

      {myBid && (
        <ConfirmDialog
          open={withdrawOpen}
          onOpenChange={(o) => !busy && setWithdrawOpen(o)}
          title="보낸 견적을 철회할까요?"
          description="철회하면 구매사가 더 이상 이 견적을 볼 수 없어요."
          confirmLabel="철회"
          variant="danger"
          loading={busy}
          onConfirm={async () => {
            setBusy(true);
            const r = await withdrawBidAction({ bidId: myBid.id });
            setBusy(false);
            if (!r.ok) {
              toast(`철회하지 못했어요 — ${r.error}`, { type: 'error' });
              return;
            }
            setWithdrawOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
