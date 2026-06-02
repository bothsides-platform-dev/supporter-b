// PG RFP 상세 본문 — 전체 페이지(app/(app)/inbox/[rfpId])가 사용.
// loader(PgRfpDetailData) 산출물만 받는 표현 컴포넌트 — 재fetch 금지.
// 바깥 패딩은 호출부(page) 책임.
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { RfpBriefPanel } from './RfpBriefPanel';
import { BidForm } from './BidForm';
import { LocalTime } from '@/components/primitives/LocalTime';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

export function PgRfpDetailContent({ data }: { data: PgRfpDetailData }) {
  const { rfp, myBid, buyerName } = data;

  if (myBid) {
    return (
      <>
        <RfpBriefPanel rfp={rfp} buyerName={buyerName} />
        <div className="mt-10 border-t border-[var(--md-sys-color-outline-variant)] pt-8 space-y-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-tertiary)]">
            ✓ 제안 제출 완료
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            제출 시각:{' '}
            {myBid.submittedAt ? <LocalTime iso={myBid.submittedAt} /> : '—'}
          </p>
          <Link
            href={`/inbox/${rfp.code}/submitted`}
            className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            제출 내역 보기 →
          </Link>
        </div>
      </>
    );
  }

  return (
    <div className="grid grid-cols-[340px_1fr] gap-12">
      {/* Left: RFP brief */}
      <div className="border-r border-[var(--md-sys-color-outline-variant)] pr-10">
        <RfpBriefPanel rfp={rfp} buyerName={buyerName} />
      </div>

      {/* Right: Bid form */}
      <div>
        <div className="mb-8">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            정형 제안 입력
          </span>
          <h2 className="text-[22px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] mt-1">
            제안 작성
          </h2>
        </div>
        <BidForm
          rfpId={rfp.id}
          rfpCode={rfp.code}
          grade={rfp.bizProfile?.grade}
          requiredPaymentMethods={rfp.requiredPaymentMethods}
          customPaymentMethods={rfp.customPaymentMethods}
        />
      </div>
    </div>
  );
}

PgRfpDetailContent.Skeleton = function PgRfpDetailContentSkeleton() {
  return (
    <div className="grid grid-cols-[340px_1fr] gap-12">
      <div className="border-r border-[var(--md-sys-color-outline-variant)] pr-10">
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-7 w-64 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-8">
          <Skeleton className="h-2 w-20 mb-2" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
};
