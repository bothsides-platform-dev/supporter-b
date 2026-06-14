'use client';

/**
 * PgDealRoomBody — PG 딜룸 본문(좌측 액션 레일 + 가운데 탭).
 *
 * 탭: 견적작성(BidWizard / 재요청 prefill / 제출완료 안내) · 요청조건(RfpBriefPanel)
 *     · 첨부. 레일: 견적작성·요청보기·첨부(탭 전환) · 철회(ConfirmDialog → withdraw).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, FileText, Paperclip, Undo2 } from 'lucide-react';

import { DealRoomActionRail, type RailAction } from '@/components/deal-room/DealRoomActionRail';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { SamplePgRfpBanner } from '@/components/inbox/SamplePgRfpBanner';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { RequoteBanner } from '@/components/inbox/RequoteBanner';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { LocalTime } from '@/components/primitives/LocalTime';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withdrawBidAction } from '@/lib/server/actions/bid/withdrawBidAction';
import { toast } from '@/lib/toast';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

export function PgDealRoomBody({ data }: { data: PgRfpDetailData }) {
  const { rfp, myBid, buyerName, quoteTemplates, pendingRequote } = data;
  const router = useRouter();
  const [tab, setTab] = useState('write');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const writeContent = pendingRequote ? (
    <>
      <RequoteBanner message={pendingRequote.message} deadline={pendingRequote.deadline} />
      <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} initialBid={myBid} />
    </>
  ) : myBid ? (
    <div className="space-y-4">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-tertiary)]">
        ✓ 견적을 보냈어요
      </p>
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        보낸 시각: {myBid.submittedAt ? <LocalTime iso={myBid.submittedAt} /> : '—'}
      </p>
      <Link
        href={`/inbox/${rfp.code}/submitted`}
        className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-on-surface)]"
      >
        보낸 견적 보기 →
      </Link>
    </div>
  ) : (
    <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} />
  );

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
      {rfp.isSample && (
        <div className="shrink-0 px-6 pt-4">
          <SamplePgRfpBanner rfpCode={rfp.code} />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
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
