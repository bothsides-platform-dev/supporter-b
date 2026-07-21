'use client';

// 활성 견적의 PG 메모 + 제안서 PDF — 아코디언 본문. 표현 전용. memo 로 감싸
// 무관 상태 변화에서 재렌더를 줄인다(PDF 렌더는 비교적 무겁다).
import { memo } from 'react';
import { BidPdfPane } from '@/components/rfp/bid-detail/BidPdfPane';
import type { Bid } from '@/lib/types/bid';

function PgMemoPdfPanelImpl({ active }: { active: Bid }) {
  return (
    <>
      {active.memo ? (
        <p className="mb-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed whitespace-pre-wrap">
          {active.memo}
        </p>
      ) : (
        <p className="mb-3 md-label-small text-[var(--md-sys-color-outline)]">
          — PG 메모 없음 —
        </p>
      )}
      <BidPdfPane pdf={active.proposalPdfs[0]} />
    </>
  );
}

export const PgMemoPdfPanel = memo(PgMemoPdfPanelImpl);
