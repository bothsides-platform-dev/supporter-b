// 구매사 '내가 요청한 조건' 뷰 — 사업자/운영 정보 + 요청 세부 + 첨부.
// RfpDetailContent 의 아코디언 본문에서 추출. 딜룸 모달의 '요청 조건' 탭이 재사용한다.
import { Label } from '@/components/primitives/Label';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';
import { Divider } from '@/components/primitives/Divider';
import { CONTRACT_TYPE_LABELS } from '@/lib/types/rfp';
import { formatRequestedPaymentMethods } from '@/lib/rfp/payment-methods';
import { buildRfpOperationRows } from '@/lib/rfp/operation-rows';

function Rows({ rows }: { rows: [string, string | undefined][] }) {
  const present = rows.filter(([, v]) => v);
  if (present.length === 0) return null;
  return (
    <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
      {present.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2">
          <span className="md-label-small shrink-0 text-[var(--md-sys-color-on-surface-variant)]">
            {label}
          </span>
          <span className="min-w-0 break-words text-right text-[13px] text-[var(--md-sys-color-on-surface)]">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <Label size="md" muted={false}>
        {children}
      </Label>
      <Divider />
    </div>
  );
}

export function RequestConditionsView({ data }: { data: BuyerRfpDetailData }) {
  const { rfp, companyName, rfpFiles } = data;
  const bizProfile = rfp.bizProfile;

  const operationRows = buildRfpOperationRows(rfp, rfp.currentFeeRate);
  const quoteRows: [string, string | undefined][] = [
    ['계약 유형', rfp.contractType ? CONTRACT_TYPE_LABELS[rfp.contractType] : undefined],
    [
      '요청 결제수단',
      formatRequestedPaymentMethods(rfp.requiredPaymentMethods, rfp.customPaymentMethods),
    ],
  ];

  return (
    <div className="space-y-7">
      <section>
        <SectionHead>사업자 정보</SectionHead>
        <Rows
          rows={[
            ['상호명', companyName],
            ['사업자번호', bizProfile?.bizNo ?? '미입력'],
            ['등급', bizProfile?.grade ? MERCHANT_TIER_LABELS[bizProfile.grade] : '미정'],
          ]}
        />
      </section>

      {operationRows.some(([, v]) => v) && (
        <section>
          <SectionHead>사업 운영 정보</SectionHead>
          <Rows rows={operationRows} />
        </section>
      )}

      {quoteRows.some(([, v]) => v) && (
        <section>
          <SectionHead>견적 조건</SectionHead>
          <Rows rows={quoteRows} />
        </section>
      )}

      {rfp.memo && (
        <section>
          <SectionHead>견적 요청 세부 내용</SectionHead>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--md-sys-color-on-surface-variant)]">
            {rfp.memo}
          </p>
        </section>
      )}

      <AttachmentPreviewList files={rfpFiles} />
    </div>
  );
}
