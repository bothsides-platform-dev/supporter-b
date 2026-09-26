'use client';

import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import { buildSubmittedSummaryRows } from '@/components/inbox/buildSubmittedSummaryRows';
import { LocalTime } from '@/components/primitives/LocalTime';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';

export function BidRoundHistory({ rfp, bids, authorNames }: {
  rfp: RFP;
  bids: Bid[];
  authorNames: Record<string, string>;
}) {
  if (bids.length === 0) return null;
  return (
    <section aria-label="견적 수정 이력" className="space-y-3">
      <h3 className="text-[16px] font-semibold">견적 수정 이력</h3>
      {bids.map((bid) => (
        <article key={bid.id} className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
            <strong className="md-numeric">{bid.round}회차</strong>
            <span>{authorNames[bid.id] ?? '담당자'}</span>
            {bid.submittedAt && <span className="md-numeric text-[var(--md-sys-color-on-surface-variant)]"><LocalTime iso={bid.submittedAt} /></span>}
          </div>
          <dl className="mt-3 divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {buildSubmittedSummaryRows(rfp, bid).slice(4).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2 text-[14px]">
                <dt className="text-[var(--md-sys-color-on-surface-variant)]">{label}</dt>
                <dd className="md-numeric text-right">{value}</dd>
              </div>
            ))}
          </dl>
          {bid.memo && <p className="mt-3 whitespace-pre-wrap text-[14px]">{bid.memo}</p>}
          {bid.proposalPdfs.length > 0 && <ul className="mt-3 space-y-1">
            {bid.proposalPdfs.map((file) => <li key={file.id}><a className="text-[14px] underline underline-offset-2" href={file.url} target="_blank" rel="noreferrer">{file.name}<span className="sr-only">{NEW_TAB_NOTICE}</span></a></li>)}
          </ul>}
        </article>
      ))}
    </section>
  );
}
