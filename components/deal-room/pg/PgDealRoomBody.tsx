'use client';

/**
 * PG 요청 정보·견적 작업을 넓은 화면에서는 나란히, 좁은 화면에서는 탭으로 제공한다.
 * 두 패널은 계속 마운트해 입력과 스크롤을 유지한다. ?tab=write는 작업을 먼저 열고,
 * 폐지된 계약 링크는 요청 정보로 연결한다. 철회는 보낸 견적 안에서 확인한다.
 */
import { PersonalDraftRecovery } from '@/components/inbox/PersonalDraftRecovery';
import { PgReviewPanel } from '@/components/rfp/MatchingStatus';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';

import { Button } from '@/components/primitives/Button';
import { PgWorkspacePanels } from './PgWorkspacePanels';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { SubmittedSummary } from '@/components/inbox/SubmittedSummary';
import { buildSubmittedSummaryRows } from '@/components/inbox/buildSubmittedSummaryRows';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { BidRoundHistory } from '@/components/inbox/bid-wizard/BidRoundHistory';
import { RequoteBanner } from '@/components/inbox/RequoteBanner';
import { LocalTime } from '@/components/primitives/LocalTime';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withdrawBidAction } from '@/lib/server/actions/bid/withdrawBidAction';
import { toast } from '@/lib/toast';
import { ContactBlock } from '@/components/deal-room/ContactBlock';
import { DealResultHeader } from '@/components/deal-room/DealResultHeader';
import type { PgDealRoomLinkTab } from '@/lib/rfp/pg-deal-room-link';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import {
  pgDealRoomBidTabLabel,
  pgDealRoomShowsBidWizard,
} from '@/lib/rfp/pg-bid-wizard-visibility';

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

export function PgDealRoomBody({
  data,
  initialTab,
  onGuestSubmit,
}: {
  data: PgRfpDetailData;
  /** 알림·메일 딥링크(`?tab=`)가 요청한 탭. 없으면 요청 조건. */
  initialTab?: PgDealRoomLinkTab;
  /**
   * 랜딩 데모(비로그인)에서 견적 제출을 서버 액션 대신 가입으로 빼는 탈출구.
   * 실제 앱에서는 주지 않는다 — 없으면 BidWizard 가 평소처럼 제출한다.
   */
  onGuestSubmit?: () => void;
}) {
  const { rfp, myBid, buyer, pendingRequote, awardedToMe, buyerContact } = data;
  const router = useRouter();

  const isAwarded = rfp.status === 'awarded';
  const effectiveDeadline = pendingRequote?.deadline ?? rfp.deadline;
  const displayRfp =
    effectiveDeadline === rfp.deadline ? rfp : { ...rfp, deadline: effectiveDeadline };
  const [closedDeadline, setClosedDeadline] = useState<string | null>(null);
  const bidWindowOpen = data.bidWindowOpen && closedDeadline !== effectiveDeadline;
  useEffect(() => {
    if (!data.bidWindowOpen) return;
    let timer: ReturnType<typeof setTimeout>;
    const closeWhenDue = () => {
      const remaining = new Date(effectiveDeadline).getTime() - Date.now();
      if (remaining <= 0) {
        setClosedDeadline(effectiveDeadline);
        router.refresh();
        return;
      }
      timer = setTimeout(closeWhenDue, Math.min(remaining, MAX_TIMEOUT_DELAY_MS));
    };
    timer = setTimeout(closeWhenDue, 0);
    return () => clearTimeout(timer);
  }, [data.bidWindowOpen, effectiveDeadline, router]);
  const showsBidWizard = pgDealRoomShowsBidWizard({
    hasPendingRequote: !!pendingRequote,
    bidWindowOpen,
    hasMyBid: !!myBid,
  });
  const bidTabLabel = pgDealRoomBidTabLabel({
    isAwarded,
    bidWindowOpen,
    hasMyBid: !!myBid,
    hasPendingRequote: !!pendingRequote,
  });
  const [tab, setTab] = useState(() =>
    initialTab === 'contract' ? 'request' : (initialTab ?? 'request'),
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasSingleBid = !!myBid && (data.myBidHistory?.length ?? 0) <= 1;
  const submittedDetail =
    myBid &&
    (hasSingleBid ? (
      <BidRoundHistory rfp={displayRfp} bids={[myBid]} authorNames={data.bidAuthorNames ?? {}} />
    ) : (
      <SubmittedSummary rows={buildSubmittedSummaryRows(displayRfp, myBid)} />
    ));
  const roundHistory =
    (data.myBidHistory?.length ?? 0) > 1 ? (
      <BidRoundHistory
        rfp={displayRfp}
        bids={data.myBidHistory!}
        authorNames={data.bidAuthorNames ?? {}}
      />
    ) : null;
  let writeContent: ReactNode;
  if (pendingRequote && showsBidWizard) {
    writeContent = (
      <>
        <RequoteBanner message={pendingRequote.message} deadline={pendingRequote.deadline} />
        <BidWizard
          key={`${data.workspaceId ?? 'demo'}:${rfp.id}:${pendingRequote.id}:${pendingRequote.deadline}`}
          rfp={rfp}
          buyer={buyer}
          initialBid={myBid}
          pendingRequoteId={pendingRequote.id}
          pendingRequoteDeadline={pendingRequote.deadline}
          workspaceId={data.workspaceId}
          userId={data.userId}
          onGuestSubmit={onGuestSubmit}
        />
      </>
    );
  } else if (isAwarded && awardedToMe) {
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="award"
          title="이 견적이 선정됐어요"
          subtitle={
            !hasSingleBid && myBid?.submittedAt ? (
              <>
                보낸 시각 <LocalTime iso={myBid.submittedAt} />
              </>
            ) : undefined
          }
        >
          {buyerContact && <ContactBlock contact={buyerContact} counterpartyKind="buyer" />}
        </DealResultHeader>

        {submittedDetail}
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
        {submittedDetail}
      </div>
    );
  } else if (data.review && ['rejected', 'withdrawn', 'buyer_ended'].includes(data.review.status)) {
    writeContent = null;
  } else if (data.hasWithdrawnBid) {
    writeContent = (
      <DealResultHeader
        tone="neutral"
        title="견적을 철회했어요"
        subtitle="요청 조건과 첨부파일은 계속 확인할 수 있어요."
      />
    );
  } else if (!bidWindowOpen && (!myBid || rfp.status === 'cancelled' || rfp.status === 'closed')) {
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="neutral"
          title={
            rfp.status === 'cancelled'
              ? '견적 요청이 취소됐어요'
              : rfp.status === 'closed'
                ? '견적 요청이 종료됐어요'
                : '견적 접수가 마감됐어요'
          }
          subtitle="요청 조건과 첨부파일은 계속 확인할 수 있어요."
        />
        {submittedDetail}
      </div>
    );
  } else if (myBid) {
    writeContent = (
      <div className="space-y-4">
        <p className="md-label-small text-[var(--md-sys-color-tertiary)]">✓ 견적을 보냈어요</p>
        <p className="text-[14px]">구매사 · 보낸 견적을 검토하고 선정해요</p>
        {!hasSingleBid && (
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            보낸 시각: {myBid.submittedAt ? <LocalTime iso={myBid.submittedAt} /> : '—'}
          </p>
        )}
        {submittedDetail}
      </div>
    );
  } else {
    writeContent = (
      <BidWizard
        key={`${data.workspaceId ?? 'demo'}:${rfp.id}:initial`}
        rfp={rfp}
        buyer={buyer}
        workspaceId={data.workspaceId}
        userId={data.userId}
        onGuestSubmit={onGuestSubmit}
      />
    );
  }

  const requestContent = (
    <>
      <RfpBriefPanel rfp={displayRfp} buyer={buyer} industryName={data.industryName} />
      {rfp.rfpFiles.length === 0 && (
        <p className="py-4 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
          구매사가 첨부한 파일이 없어요.
        </p>
      )}
    </>
  );
  const workContent = (
    <div className={`flex flex-col gap-4 ${showsBidWizard ? 'h-full min-h-0' : 'min-h-full'}`}>
      {data.review && (
        <PgReviewPanel
          rfpId={rfp.id}
          status={rfp.status}
          review={data.review}
          bidWindowOpen={bidWindowOpen}
          onReviewStarted={() => setTab('write')}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col">{writeContent}</div>
      {!showsBidWizard && <PersonalDraftRecovery data={data} />}
      {roundHistory &&
        (showsBidWizard ? (
          <details className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] pt-2">
            <summary className="cursor-pointer py-2 text-[14px] text-[var(--md-sys-color-primary)]">
              이전 견적 비교하기
            </summary>
            <div className="max-h-48 overflow-y-auto pt-2">{roundHistory}</div>
          </details>
        ) : (
          roundHistory
        ))}
      {myBid && !data.hasWithdrawnBid && !isAwarded && (!pendingRequote || !bidWindowOpen) && (
        <div className="border-t border-[var(--md-sys-color-outline-variant)] pt-4">
          <Button
            variant="text"
            color="error"
            icon={<Undo2 />}
            onClick={() => setWithdrawOpen(true)}
          >
            견적 철회
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PgWorkspacePanels
        active={tab}
        onChange={setTab}
        writeLabel={bidTabLabel}
        request={requestContent}
        work={workContent}
      />

      {myBid && (
        <ConfirmDialog
          open={withdrawOpen}
          onOpenChange={(o) => !busy && setWithdrawOpen(o)}
          title="보낸 견적을 철회할까요?"
          description={
            data.review
              ? `철회하면 구매사가 이 견적을 볼 수 없고, 이 상담에는 다시 견적을 보낼 수 없어요.${rfp.status === 'sent' ? ' 구매사는 다른 PG사에 상담을 요청할 수 있어요. 수정이 필요하면 구매사에게 견적 재요청을 부탁해주세요.' : ''}`
              : '철회하면 구매사가 더 이상 이 견적을 볼 수 없어요.'
          }
          confirmLabel="철회"
          variant="danger"
          loading={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              const r = await withdrawBidAction({ bidId: myBid.id });
              if (!r.ok) {
                toast(
                  r.error === 'REQUOTE_PENDING'
                    ? '수정 요청에 응답하는 동안은 견적을 철회할 수 없어요.'
                    : `철회하지 못했어요 — ${r.error}`,
                  { type: 'error' },
                );
                return;
              }
              setWithdrawOpen(false);
              router.refresh();
            } catch {
              toast('철회 결과를 확인하지 못했어요. 새로고침해 상태를 확인한 뒤 다시 시도해요.', {
                type: 'error',
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
