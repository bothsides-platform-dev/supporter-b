import Link from 'next/link';
import { OpportunityRequestDialog } from './OpportunityRequestDialog';
import type { OpportunityListing } from '@/lib/types/pg-request';
import { formatDate, formatDeadline } from '@/lib/format';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/types/bid';
import { cn } from '@/lib/utils';

// 마감 임박(D-2 이하)을 빨강으로 강조하는 칩 — PG 화면 공통 신호.
function DeadlineChip({ deadline }: { deadline: string }) {
  const d = formatDeadline(deadline); // "D-2" | "D-0" | "마감"
  const urgent = d.startsWith('D-') && parseInt(d.slice(2)) <= 3;
  return (
    <span
      data-testid="deadline-chip"
      className={cn(
        'md-numeric shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
        urgent
          ? 'bg-[color-mix(in_srgb,var(--md-sys-color-error)_16%,transparent)] text-[var(--md-sys-color-error)]'
          : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]',
      )}
    >
      {d}
    </span>
  );
}

/**
 * 오픈 RFP 게시판 목록. 공개 화이트리스트(구매사명·제목·홈페이지·마감일·요청 결제수단·
 * 취급 상품)만 렌더한다 — 수수료 등 경쟁정보는 OpportunityListing 에 애초에 담겨 있지 않다.
 * 강조 = "지금 잡을 만한가": 구매사명·제목(1차) + 마감 D-n 칩. 나머지는 작게 강등.
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
        {shown.map((it) => {
          const paymentLabels = [
            ...it.requiredPaymentMethods.map(
              (m) => PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m,
            ),
            ...it.customPaymentMethodLabels,
          ];
          return (
            <li
              key={it.rfpCode}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">{it.buyerName}</span>
                  <span className="mx-1.5 text-[var(--md-sys-color-outline-variant)]">·</span>
                  {it.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  {paymentLabels.length > 0 && (
                    <span className="truncate">{paymentLabels.join(' · ')}</span>
                  )}
                  {it.mainProducts && <span className="truncate">{it.mainProducts}</span>}
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
                  <span className="md-numeric text-[var(--md-sys-color-outline)]">{it.rfpCode}</span>
                  <span className="md-numeric">{formatDate(it.deadline)}</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <DeadlineChip deadline={it.deadline} />
                <OpportunityRequestDialog rfpCode={it.rfpCode} />
              </div>
            </li>
          );
        })}
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
