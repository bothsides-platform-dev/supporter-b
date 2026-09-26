'use client';

/**
 * PgDealRoomBody — PG 딜룸 본문(상단 탭으로 콘텐츠 이동을 통합).
 *
 * 탭: 요청조건(RfpBriefPanel, 맨 앞·기본 활성 — 조건을 먼저 읽는다) · (signing 있을 때)
 *     계약(SigningTab) · 견적작성(BidWizard / 재요청 prefill / 제출완료 안내) · 첨부.
 *     알림·메일 딥링크(`?tab=`, `initialTab`)만 예외로 계약·견적작성 탭을 먼저 연다.
 *     철회는 보낸 견적 본문에서 확인 다이얼로그를 거친다.
 */
import { PgReviewPanel } from '@/components/rfp/MatchingStatus';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';

import { Button } from '@/components/primitives/Button';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { SubmittedSummary } from '@/components/inbox/SubmittedSummary';
import { buildSubmittedSummaryRows } from '@/components/inbox/buildSubmittedSummaryRows';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { BidRoundHistory } from '@/components/inbox/bid-wizard/BidRoundHistory';
import { RequoteBanner } from '@/components/inbox/RequoteBanner';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { LocalTime } from '@/components/primitives/LocalTime';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withdrawBidAction } from '@/lib/server/actions/bid/withdrawBidAction';
import { toast } from '@/lib/toast';
import { ContactBlock } from '@/components/deal-room/ContactBlock';
import { DealResultHeader } from '@/components/deal-room/DealResultHeader';
import { pgContractAction } from '@/lib/signing/pg-contract-action';
import { SigningSummaryStrip } from '@/components/deal-room/signing/SigningSummaryStrip';
import { buildContractTabEntries } from '@/components/deal-room/signing/build-contract-tab-entries';
import { CONTRACT_TEMPLATES_ENABLED } from '@/lib/features/contract-templates';
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
  const {
    rfp, myBid, buyer, quoteTemplates, pendingRequote, awardedToMe, buyerContact, signing,
    linkedSigningTemplate, signingTemplates,
  } = data;
  const router = useRouter();

  const isAwarded = rfp.status === 'awarded';
  const effectiveDeadline = pendingRequote?.deadline ?? rfp.deadline;
  const displayRfp = effectiveDeadline === rfp.deadline
    ? rfp
    : { ...rfp, deadline: effectiveDeadline };
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
  // 봉인입찰 방어 — 로더가 이미 awardedToMe 일 때만 signing 을 내리지만, 컴포넌트도
  // 같은 불변식을 지켜 미선정 PG 에게 낙찰자의 계약 상태가 새지 않게 한다.
  const contractVisible = awardedToMe ? signing : null;
  // 계약서 템플릿 kill switch — 위저드 피커와 딜룸 지름길이 여기 한 곳에서 함께 꺼진다.
  // 피커는 **undefined 여야** 사라진다: BidWizard 의 게이트가 truthy 검사라 `[]` 를
  // 넘기면 '저장된 템플릿이 없어요 + 템플릿 관리 링크' 안내 카드가 그대로 남는다.
  const linkedTemplateVisible =
    CONTRACT_TEMPLATES_ENABLED && awardedToMe ? linkedSigningTemplate : null;
  const signingTemplatesVisible = CONTRACT_TEMPLATES_ENABLED ? signingTemplates : undefined;

  // 계약이 있어도 요청 조건으로 연다 — PG 는 조건을 먼저 확인한다(구매사 딜룸은 계약이 기본).
  // 딥링크만 예외다. 계약 딥링크는 계약 탭이 실제로 있을 때만 따른다 — 미선정 PG
  // (contractVisible=null)가 링크를 들고 와도 봉인 경계는 그대로다.
  const [tab, setTab] = useState(() =>
    initialTab === 'contract' ? (contractVisible ? 'contract' : 'request') : (initialTab ?? 'request'),
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  let writeContent: ReactNode;
  if (pendingRequote && showsBidWizard) {
    writeContent = (
      <>
        <RequoteBanner message={pendingRequote.message} deadline={pendingRequote.deadline} />
        <BidWizard key={`${data.workspaceId ?? 'demo'}:${rfp.id}:${pendingRequote.id}:${pendingRequote.deadline}`} rfp={rfp} buyer={buyer} templates={quoteTemplates} signingTemplates={signingTemplatesVisible} initialBid={myBid} pendingRequoteId={pendingRequote.id} pendingRequoteDeadline={pendingRequote.deadline} workspaceId={data.workspaceId} onGuestSubmit={onGuestSubmit} />
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
        {contractVisible && (
          <SigningSummaryStrip signing={contractVisible} side="pg" onOpen={() => setTab('contract')} />
        )}
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(displayRfp, myBid)} />}
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
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(displayRfp, myBid)} />}
      </div>
    );
  } else if (data.review && ['rejected', 'withdrawn'].includes(data.review.status)) {
    writeContent = <PgReviewPanel rfpId={rfp.id} status={rfp.status} review={data.review} />;
  } else if (!bidWindowOpen) {
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="neutral"
          title={rfp.status === 'cancelled' ? '견적 요청이 취소됐어요' : '견적 요청이 마감됐어요'}
          subtitle="요청 조건과 첨부파일은 계속 확인할 수 있어요."
        />
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(displayRfp, myBid)} />}
      </div>
    );
  } else if (myBid) {
    writeContent = (
      <div className="space-y-4">
        <p className="md-label-small text-[var(--md-sys-color-tertiary)]">
          ✓ 견적을 보냈어요
        </p>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          보낸 시각: {myBid.submittedAt ? <LocalTime iso={myBid.submittedAt} /> : '—'}
        </p>
        <SubmittedSummary rows={buildSubmittedSummaryRows(displayRfp, myBid)} />
      </div>
    );
  } else {
    writeContent = <BidWizard key={`${data.workspaceId ?? 'demo'}:${rfp.id}:initial`} rfp={rfp} buyer={buyer} templates={quoteTemplates} signingTemplates={signingTemplatesVisible} workspaceId={data.workspaceId} onGuestSubmit={onGuestSubmit} />;
  }

  // signing 이 아니라 contractVisible 을 넘긴다 — 위 봉인입찰 방어(미선정 PG 에겐
  // null)가 여기서도 그대로 이어져야 계약 탭이 낙찰자 상태를 새지 않는다.
  const contractTabs = buildContractTabEntries({
    rfpCode: rfp.code,
    signing: contractVisible,
    side: 'pg',
    contact: buyerContact,
    counterpartyWsId: rfp.buyerWsId,
    buyerSigner: buyerContact,
    linkedSigningTemplate: linkedTemplateVisible,
  });

  const tabs: DealRoomTab[] = [
    {
      id: 'request',
      label: '요청 조건',
      content: <>
        {contractVisible && data.contractState && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">이 견적이 선정됐어요</p>
              <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                {data.contractState.status === 'awaiting_pg_template' && !data.contractState.hasProviderRef
                  ? '회사 정보를 확인하고 계약 탭에서 서명을 요청해요.'
                  : '계약 탭에서 진행 상태와 다음 할 일을 확인해요.'}
              </p>
            </div>
            <Button onClick={() => setTab('contract')}>{pgContractAction(data.contractState).label}</Button>
          </div>
        )}
        {data.review && <PgReviewPanel rfpId={rfp.id} status={rfp.status} review={data.review} onReviewStarted={() => setTab('write')} />}
        {data.industryName && <dl className="mb-4 flex gap-4 border-b border-[var(--md-sys-color-outline-variant)] pb-3 text-[14px]"><dt className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]">업종</dt><dd className="min-w-0 break-words">{data.industryName}</dd></dl>}
        <RfpBriefPanel rfp={displayRfp} buyer={buyer} onOpenAttachments={() => setTab('attach')} /></>,
    },
    ...contractTabs,
    {
      id: 'write',
      label: bidTabLabel,
      content: (
        <div className="space-y-6">
          {writeContent}
          {(data.myBidHistory?.length ?? 0) > 1 && (
            <BidRoundHistory rfp={displayRfp} bids={data.myBidHistory!} authorNames={data.bidAuthorNames ?? {}} />
          )}
          {myBid && !isAwarded && (!pendingRequote || !bidWindowOpen) && (
            <div className="border-t border-[var(--md-sys-color-outline-variant)] pt-4">
              <Button variant="text" color="error" icon={<Undo2 />} onClick={() => setWithdrawOpen(true)}>
                견적 철회
              </Button>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'attach',
      label: '첨부',
      content: rfp.rfpFiles.length > 0
        ? <AttachmentPreviewList files={rfp.rfpFiles} />
        : <p className="py-6 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">구매사가 첨부한 파일이 없어요.</p>,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DealRoomCenter tabs={tabs} activeId={tab} onChange={setTab} />

      {myBid && (
        <ConfirmDialog
          open={withdrawOpen}
          onOpenChange={(o) => !busy && setWithdrawOpen(o)}
          title="보낸 견적을 철회할까요?"
          description={data.review
            ? `철회하면 구매사가 이 견적을 볼 수 없고, 이 상담에는 다시 견적을 보낼 수 없어요.${rfp.status === 'sent' ? ' 구매사는 다른 PG사에 상담을 요청할 수 있어요. 수정이 필요하면 구매사에게 견적 재요청을 부탁해주세요.' : ''}`
            : '철회하면 구매사가 더 이상 이 견적을 볼 수 없어요.'}
          confirmLabel="철회"
          variant="danger"
          loading={busy}
          onConfirm={async () => {
            setBusy(true);
            const r = await withdrawBidAction({ bidId: myBid.id });
            setBusy(false);
            if (!r.ok) {
              toast(r.error === 'REQUOTE_PENDING' ? '수정 요청에 응답하는 동안은 견적을 철회할 수 없어요.' : `철회하지 못했어요 — ${r.error}`, { type: 'error' });
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
