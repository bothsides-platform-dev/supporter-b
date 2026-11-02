'use client';
import type { ReactNode } from 'react';
import type { RfpDraftStore } from '@/lib/stores/rfp-draft';
import { productInfoRows, productInfoSchema } from '@/lib/rfp/product-info';
import { cn } from '@/lib/utils';
import { Divider } from '@/components/primitives/Divider';
import { formatSize, formatKrwReadable, formatKrwField, formatFeeRateDisplay, formatBizNoDisplay } from '@/lib/utils/format';
import { CONTRACT_TYPE_LABELS } from '@/lib/types/rfp';
import { formatSolutionSummary } from '@/lib/rfp/solutions';
import { formatRequestedPaymentMethods } from '@/lib/rfp/payment-methods';
function ReviewRow({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  // 최종 확인 화면 — 빈 값도 숨기지 않고 '미입력'으로 노출해 누락을 알아챌 수 있게 한다.
  const empty = !value;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5 last:border-0">
      <span className="md-label-small shrink-0 text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 break-words text-right text-[13px]',
          numeric && 'md-numeric',
          empty
            ? 'text-[var(--md-sys-color-on-surface-variant)]'
            : 'text-[var(--md-sys-color-on-surface)]',
        )}
      >
        {value || '미입력'}
      </span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <Divider />
    </div>
  );
}


export function RequestSummary({ draft, industryName, workspaceName, bizProfile, compact = true, actions, attachmentCount = draft.rfpFiles.length }: {
  draft: Omit<RfpDraftStore, 'setField' | 'reset'>; industryName: string; workspaceName?: string;
  bizProfile?: { bizNo?: string }; compact?: boolean; actions?: ReactNode; attachmentCount?: number;
}) {
  const product = productInfoSchema.safeParse(draft.productInfo);
  const paymentMethodSummary = formatRequestedPaymentMethods(draft.requiredPaymentMethods, draft.customPaymentMethods) ?? '';
  const solutionSummary = formatSolutionSummary(draft.currentSolution, draft.currentSolutionDetail) ?? '';
  const fullSummary = (
    <>
      {/* 견적 요청 요약 */}
      <div>
        <SectionHeader label="견적 요청 요약" />
        <div className="border border-[var(--md-sys-color-outline-variant)]">
          <ReviewRow label="상호명" value={workspaceName ?? ''} />
          <ReviewRow label="사업자번호" value={bizProfile?.bizNo ? formatBizNoDisplay(bizProfile.bizNo) : ''} numeric />
          <ReviewRow
            label="견적 유형"
            value={draft.contractType ? CONTRACT_TYPE_LABELS[draft.contractType] : ''}
          />
          <ReviewRow label="제목" value={draft.title} />
          <ReviewRow label="업종" value={industryName} />
          <ReviewRow label="홈페이지" value={draft.websiteUrl} />
          <ReviewRow label="주요 상품" value={draft.mainProducts} />
          {product.success && productInfoRows(product.data).map(([label, value]) => <ReviewRow key={label} label={label} value={value ?? ''} numeric={label === '최고 상품 가격대'} />)}
          {/* PG 계약 이력 — 신규 계약에서는 존재할 수 없어(서버에서도 strip) 요약에서 숨긴다. */}
          {draft.contractType === 'renewal' && <ReviewRow label="현재 이용 중인 PG사" value={draft.currentPgs?.map(pg => pg.name).join(', ') ?? ''} />}
          {draft.contractType !== 'new' && (
            <>
              <ReviewRow label="월 평균 거래액" value={draft.monthlyAvgPgVolume ? (formatKrwReadable(Number(draft.monthlyAvgPgVolume)) || draft.monthlyAvgPgVolume) : ''} numeric />
              <ReviewRow
                label={
                  draft.currentFeeRate && !draft.currentFeeVisibleToPg
                    ? '카드 수수료 (PG 비공개)'
                    : '카드 수수료'
                }
                value={formatFeeRateDisplay(draft.currentFeeRate)}
                numeric
              />
              <ReviewRow label="월 정산한도" value={formatKrwField(draft.currentSettlementLimit)} numeric />
              <ReviewRow
                label="보증보험"
                value={formatKrwField(draft.currentGuaranteeInsurance)}
                numeric
              />
              <ReviewRow
                label="정산주기"
                value={draft.currentSettlementCycle}
                numeric
              />
            </>
          )}
          <ReviewRow
            label="배송 및 서비스 기간"
            value={draft.deliveryServicePeriod}
          />
          <ReviewRow label="현재 솔루션" value={solutionSummary} />
          <ReviewRow label="견적 결제수단" value={paymentMethodSummary} />
        </div>
      </div>

      {/* 상세 요청사항 (메모) — 발송 시 trim되어 빠지므로 공백뿐이면 미입력 표기 */}
      <div>
        <SectionHeader label="상세 요청사항" />
        {draft.memo.trim() ? (
          <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap break-words border border-[var(--md-sys-color-outline-variant)] p-4">
            {draft.memo}
          </p>
        ) : (
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] p-4">
            미입력
          </p>
        )}
      </div>

      {/* 첨부파일 */}
      <div>
        <SectionHeader label={`첨부파일 (${draft.rfpFiles.length}개)`} />
        {draft.rfpFiles.length > 0 ? (
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {draft.rfpFiles.map((file, i) => (
              <div
                key={file.id}
                className="py-2 flex items-center gap-3 min-w-0"
              >
                <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">
                  {file.name}
                </span>
                <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] shrink-0 ml-auto">
                  {formatSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] border-t border-[var(--md-sys-color-outline-variant)] py-2">
            첨부파일이 없어요
          </p>
        )}
      </div>

    </>
  );

  return compact ? (
        <section aria-label="요청 요약">
          <SectionHeader label="요청 요약" />
          {actions}
          <div className="border border-[var(--md-sys-color-outline-variant)]">
            <ReviewRow label="제목" value={draft.title} />
            <ReviewRow label="업종" value={industryName} />
            <ReviewRow label="견적 결제수단" value={paymentMethodSummary} />
            <ReviewRow label="첨부파일" value={attachmentCount ? `${attachmentCount}개` : '없음'} numeric />
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer py-1 text-[14px] text-[var(--md-sys-color-primary)]">요청 내용 전체 보기</summary>
            <div className="mt-3 space-y-6">{fullSummary}</div>
          </details>
        </section>
  ) : fullSummary;
}
