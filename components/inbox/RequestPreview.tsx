'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RfpBriefPanel } from './RfpBriefPanel';
import { MarkInboxViewed } from './MarkInboxViewed';
import { BidRoundHistory } from './bid-wizard/BidRoundHistory';
import { PgReviewPanel } from '@/components/rfp/MatchingStatus';
import { ContactBlock } from '@/components/deal-room/ContactBlock';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { PgRequestStateInput } from '@/lib/rfp/pg-request-state';
import { pgRequestState } from '@/lib/rfp/pg-request-state';
import { Chip } from '@/components/primitives/Chip';

export function RequestPreview({
  data,
  failed,
  onOpenWork,
  demoState,
}: {
  data: PgRfpDetailData | null;
  failed?: boolean;
  onOpenWork?: () => void;
  demoState?: PgRequestStateInput;
}) {
  const router = useRouter();
  if (failed)
    return (
      <div role="alert" className="p-5">
        요청을 불러오지 못했어요.{' '}
        <button type="button" className="underline" onClick={() => router.refresh()}>
          다시 불러오기
        </button>
      </div>
    );
  if (!data)
    return (
      <p role="alert" className="p-5">
        요청을 열 수 없어요. 목록에서 접근할 수 있는 요청을 다시 선택해요.
      </p>
    );
  const { rfp } = data;
  const state = pgRequestState(
    demoState ?? {
      stage: data.awardedToMe ? 'won' : data.myBid ? 'submitted' : 'received',
      rfpStatus: rfp.status,
      reviewStatus: data.hasWithdrawnBid ? 'withdrawn' : data.review?.status,
      rfpDeadline: data.pendingRequote?.deadline ?? rfp.deadline,
      bidWindowOpen: data.bidWindowOpen,
      hasPendingRequote: !!data.pendingRequote,
    },
  );
  return (
    <div className="space-y-5 p-5 text-[16px]">
      {!onOpenWork && <MarkInboxViewed rfpId={rfp.code} />}
      <div>
        <p className="mb-2 break-words text-[18px] font-semibold">{data.buyer.name}</p>
        <Chip label={state.label} color={state.color} />
        <p className="my-3">
          {state.nextActor && `${state.nextActor} · `}
          {state.nextAction}
        </p>
        {onOpenWork ? (
          <button
            type="button"
            className="min-h-11 text-[var(--md-sys-color-primary)] underline"
            onClick={onOpenWork}
          >
            견적 작업 화면 열기
          </button>
        ) : (
          <>
            <Link
              href={`/inbox/${rfp.code}?tab=${state.tab}`}
              prefetch={false}
              className="inline-flex min-h-9 items-center rounded-[6px] bg-[var(--md-sys-color-primary)] px-3 text-[14px] text-[var(--md-sys-color-on-primary)]"
            >
              {state.actionLabel}
            </Link>
            <Link
              href={`/inbox/${rfp.code}`}
              prefetch={false}
              className="ml-4 inline-block py-2 text-[14px] underline"
            >
              넓은 화면에서 보기
            </Link>
          </>
        )}
      </div>
      {data.review && !onOpenWork && (
        <PgReviewPanel
          rfpId={rfp.id}
          status={rfp.status}
          review={data.review}
          bidWindowOpen={data.bidWindowOpen}
        />
      )}
      {data.awardedToMe && data.buyerContact && (
        <ContactBlock contact={data.buyerContact} counterpartyKind="buyer" />
      )}
      <RfpBriefPanel
        rfp={{
          ...rfp,
          deadline: data.pendingRequote?.deadline ?? rfp.deadline,
        }}
        buyer={data.buyer}
        industryName={data.industryName}
      />
      {!rfp.rfpFiles.length && <p className="text-[14px]">구매사가 첨부한 자료가 없어요.</p>}
      {!!data.myBidHistory.length && (
        <section aria-label="자사 견적과 수정 이력">
          <BidRoundHistory rfp={rfp} bids={data.myBidHistory} authorNames={data.bidAuthorNames} />
        </section>
      )}
    </div>
  );
}
