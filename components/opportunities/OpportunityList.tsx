import Link from 'next/link';
import { OpportunityRequestDialog } from './OpportunityRequestDialog';
import type { OpportunityListing } from '@/lib/types/pg-request';

/**
 * 오픈 RFP 게시판 목록. 공개 화이트리스트(구매사명·제목·홈페이지)만 렌더한다 —
 * 수수료 등 핵심 거래정보는 OpportunityListing 에 애초에 담겨 있지 않다.
 * `limit` 지정 시 미리보기(홈)로 잘라 보여주고 `showAllHref` 로 전체 보기 링크 노출.
 */
export function OpportunityList({
  items,
  limit,
  showAllHref,
}: {
  items: OpportunityListing[];
  limit?: number;
  showAllHref?: string;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  const hasMore = limit != null && items.length > limit;

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-[var(--md-sys-color-outline-variant)]">
        {shown.map((it) => (
          <li
            key={it.rfpCode}
            className="flex items-start justify-between gap-3 py-2.5"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
                {it.title}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                <span className="truncate">{it.buyerName}</span>
                {it.websiteUrl && (
                  <a
                    href={it.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[var(--md-sys-color-primary)] hover:underline"
                  >
                    {it.websiteUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <span className="md-numeric text-[var(--md-sys-color-on-surface-variant)]">
                  {it.rfpCode}
                </span>
              </span>
            </div>
            <div className="shrink-0">
              <OpportunityRequestDialog rfpCode={it.rfpCode} />
            </div>
          </li>
        ))}
      </ul>
      {hasMore && showAllHref && (
        <Link
          href={showAllHref}
          className="mt-1.5 self-start text-[13px] text-[var(--md-sys-color-primary)] hover:underline"
        >
          전체 보기
        </Link>
      )}
    </div>
  );
}
