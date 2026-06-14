// 구매사 '내가 요청한 조건' 뷰 — 사업자/운영 정보 + 요청 세부 + 첨부.
// RfpDetailContent 의 아코디언 본문에서 추출. 딜룸 모달의 '요청 조건' 탭이 재사용한다.
import { Label } from '@/components/primitives/Label';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { formatKrwReadable, formatKrwField, formatFeeRateDisplay } from '@/lib/format';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';

const SOLUTION_LABELS: Record<string, string> = {
  cafe24: '카페24',
  imweb: '아임웹',
  makeshop: '메이크샵',
  godo: '고도몰',
  self: '자체 개발',
  other: '기타',
};

function formatSolution(solution?: string | null, detail?: string | null): string | undefined {
  if (!solution) return undefined;
  const label = SOLUTION_LABELS[solution] ?? solution;
  return (solution === 'self' || solution === 'other') && detail
    ? `${label} (${detail})`
    : label;
}

function Rows({ rows }: { rows: [string, string | undefined][] }) {
  const present = rows.filter(([, v]) => v);
  if (present.length === 0) return null;
  return (
    <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
      {present.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between py-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            {label}
          </span>
          <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
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
      <div className="h-px flex-1 bg-[var(--md-sys-color-outline-variant)]" />
    </div>
  );
}

export function RequestConditionsView({ data }: { data: BuyerRfpDetailData }) {
  const { rfp, companyName, rfpFiles } = data;
  const bizProfile = rfp.bizProfile;

  const operationRows: [string, string | undefined][] = [
    ['사업 운영 홈페이지', rfp.websiteUrl],
    ['주요 판매 상품', rfp.mainProducts],
    [
      '전년도 연간 PG 거래액',
      rfp.annualPgVolume
        ? formatKrwReadable(Number(rfp.annualPgVolume)) || rfp.annualPgVolume
        : undefined,
    ],
    ['현재 카드 수수료', formatFeeRateDisplay(rfp.currentFeeRate)],
    ['현재 정산주기', rfp.currentSettlementCycle],
    ['현재 월 정산한도', formatKrwField(rfp.currentSettlementLimit)],
    ['현재 보증보험', formatKrwField(rfp.currentGuaranteeInsurance)],
    ['현재 운영 솔루션', formatSolution(rfp.currentSolution, rfp.currentSolutionDetail)],
  ];

  return (
    <div className="space-y-7">
      <section>
        <SectionHead>사업자 정보</SectionHead>
        <Rows
          rows={[
            ['상호명', companyName],
            ['사업자번호', bizProfile?.bizNo ?? '미입력'],
            ['등급', bizProfile?.grade ? GRADE_LABELS[bizProfile.grade] : '미정'],
          ]}
        />
      </section>

      {operationRows.some(([, v]) => v) && (
        <section>
          <SectionHead>사업 운영 정보</SectionHead>
          <Rows rows={operationRows} />
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
