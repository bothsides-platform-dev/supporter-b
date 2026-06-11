// PG RFP 상세 본문 — 전체 페이지(app/(app)/inbox/[rfpId])가 사용.
// loader(PgRfpDetailData) 산출물만 받는 표현 컴포넌트 — 재fetch 금지.
// 바깥 패딩은 호출부(page) 책임.
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { RfpBriefPanel } from './RfpBriefPanel';
import { BidWizard } from './bid-wizard/BidWizard';
import { SamplePgRfpBanner } from './SamplePgRfpBanner';
import { LocalTime } from '@/components/primitives/LocalTime';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

export function PgRfpDetailContent({
  data,
  variant = 'peek',
}: {
  data: PgRfpDetailData;
  variant?: 'peek' | 'full';
}) {
  const { rfp, myBid, buyerName, quoteTemplates } = data;
  // 온보딩 샘플 안내 + 삭제 — 모든 분기 상단에 노출.
  const sampleBanner = rfp.isSample ? (
    <div className="mb-6">
      <SamplePgRfpBanner rfpCode={rfp.code} />
    </div>
  ) : null;

  if (myBid) {
    return (
      <>
        {sampleBanner}
        <RfpBriefPanel rfp={rfp} buyerName={buyerName} />
        <div className="mt-10 border-t border-[var(--md-sys-color-outline-variant)] pt-8 space-y-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-tertiary)]">
            ✓ 견적을 보냈어요
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            보낸 시각:{' '}
            {myBid.submittedAt ? <LocalTime iso={myBid.submittedAt} /> : '—'}
          </p>
          <Link
            href={`/inbox/${rfp.code}/submitted`}
            className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            보낸 견적 보기 →
          </Link>
        </div>
      </>
    );
  }

  if (variant === 'full') {
    return (
      <>
        {sampleBanner}
        <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} />
      </>
    );
  }

  // peek(기본): 읽기전용 브리프 + 전체 페이지로 가는 '견적 작성' CTA
  return (
    <div>
      {sampleBanner}
      <RfpBriefPanel rfp={rfp} buyerName={buyerName} />
      <div className="mt-8 border-t border-[var(--md-sys-color-outline-variant)] pt-6">
        <Link
          href={`/inbox/${rfp.code}`}
          className="inline-flex items-center rounded-[6px] bg-[var(--md-sys-color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
        >
          견적 작성 →
        </Link>
      </div>
    </div>
  );
}

PgRfpDetailContent.Skeleton = function PgRfpDetailContentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-32 mb-2" />
      <Skeleton className="h-7 w-64 mb-4" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
};
