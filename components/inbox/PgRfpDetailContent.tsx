// PG RFP 상세 본문 — 전체 페이지(app/(app)/inbox/[rfpId])와 가로채기 모달이 공유.
// loader(PgRfpDetailData) 산출물만 받는 표현 컴포넌트 — 재fetch 금지.
// 바깥 패딩은 호출부(page/modal) 책임.
import Link from 'next/link';
import { RfpBriefPanel } from './RfpBriefPanel';
import { BidForm } from './BidForm';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

export function PgRfpDetailContent({
  data,
  mode = 'page',
}: {
  data: PgRfpDetailData;
  mode?: 'page' | 'modal';
}) {
  const { rfp, myBid } = data;

  if (myBid) {
    return (
      <>
        <RfpBriefPanel rfp={rfp} />
        <div className="mt-10 border-t border-[var(--md-sys-color-outline-variant)] pt-8 space-y-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-tertiary)]">
            ✓ 제안 제출 완료
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            제출 시각:{' '}
            {myBid.submittedAt
              ? new Date(myBid.submittedAt).toLocaleString('ko-KR')
              : '—'}
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
        <RfpBriefPanel rfp={rfp} />
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
          mode={mode}
        />
      </div>
    </div>
  );
}
