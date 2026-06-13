// 구매사 RFP 상세 본문 — 전체 페이지(app/(app)/rfp/[id])가 사용.
// IA: 헤더 → 아코디언('내가 요청한 조건') → FocusComparison(견적 비교·선정) →
// 아코디언('PG 초대 · 게시판 노출 관리'). loader(BuyerRfpDetailData) 산출물만 받는
// 표현 컴포넌트 — 재fetch 금지. 바깥 패딩/PageEnter 래핑은 호출부(page) 책임.
import { Label } from '@/components/primitives/Label';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { ChatRailToggle } from '@/components/messages/ChatRailToggle';
import { SampleRfpBanner } from '@/components/rfp/SampleRfpBanner';
import { FocusComparison } from '@/components/rfp/comparison/FocusComparison';
import { RfpInviteManager } from '@/components/rfp/RfpInviteManager';
import { RfpBoardVisibilityToggle } from '@/components/rfp/RfpBoardVisibilityToggle';
import { RfpPendingRequests } from '@/components/rfp/RfpPendingRequests';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { formatDate, formatKrwReadable } from '@/lib/format';
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

const statusLabel: Record<string, string> = {
  draft: '임시저장',
  sent: '요청 보냄',
  closed: '마감',
  awarded: '선정 완료',
  cancelled: '취소',
};
const statusColor: Record<string, ChipColor> = {
  draft: 'surface',
  sent: 'warning',
  closed: 'surface',
  awarded: 'tertiary',
  cancelled: 'error',
};

export function RfpDetailContent({ data }: { data: BuyerRfpDetailData }) {
  const {
    rfp,
    bids,
    rfpFiles,
    companyName,
    inviteList,
    pgWsNameMap,
    pendingRequests,
    canEdit,
    requoteByPg,
  } = data;
  const bizProfile = rfp.bizProfile;

  // 아코디언 기본 펼침 — 받은 견적 0건 또는 콜드피치 대기 > 0 이면 'PG 관리' 자동 펼침.
  const pendingCount = pendingRequests.length;
  const autoOpenPgManage = bids.length === 0 || pendingCount > 0;
  const defaultOpen = autoOpenPgManage ? ['pg-manage'] : [];

  const operationRows: [string, string | undefined][] = [
    ['사업 운영 홈페이지', rfp.websiteUrl],
    ['주요 판매 상품', rfp.mainProducts],
    ['전년도 연간 PG 거래액', rfp.annualPgVolume ? (formatKrwReadable(Number(rfp.annualPgVolume)) || rfp.annualPgVolume) : undefined],
    ['현재 카드 수수료', rfp.currentFeeRate],
    ['현재 정산주기', rfp.currentSettlementCycle],
    ['현재 월 정산한도', rfp.currentSettlementLimit],
    ['현재 보증보험', rfp.currentGuaranteeInsurance],
    ['현재 운영 솔루션', formatSolution(rfp.currentSolution, rfp.currentSolutionDetail)],
  ];

  return (
    <>
      {rfp.isSample && <SampleRfpBanner rfpCode={rfp.code} />}
      {/* Header */}
      <div>
        <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          {rfp.code}
        </span>
        <div className="flex items-start justify-between mt-1 gap-4">
          <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            {rfp.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <ChatRailToggle />
            {rfp.isSample && <Chip label="샘플" color="surface" />}
            <Chip label={statusLabel[rfp.status]} color={statusColor[rfp.status]} />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Label size="md" muted={false}>마감 {formatDate(rfp.deadline)}</Label>
          <span className="text-[var(--md-sys-color-outline)]">·</span>
          <Label size="md" muted={false}>PG {rfp.allowedPgWorkspaceIds.length}개사</Label>
          <span className="text-[var(--md-sys-color-outline)]">·</span>
          <Label size="md" muted={false}>받은 견적 {bids.length}건</Label>
        </div>
      </div>

      {/* '내가 요청한 조건' — 기본 접힘 */}
      <Accordion className="mt-2">
        <AccordionItem value="request-conditions" title="내가 요청한 조건">
          <div className="grid grid-cols-2 gap-10">
            <section>
              <div className="flex items-center gap-3 mb-3">
                <Label size="md" muted={false}>사업자 정보</Label>
                <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
              </div>
              <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
                {(
                  [
                    ['상호명', companyName],
                    ['사업자번호', bizProfile?.bizNo ?? '미입력'],
                    ['등급', bizProfile?.grade ? GRADE_LABELS[bizProfile.grade] : '미정'],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="py-2 flex items-baseline justify-between">
                    <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                      {label}
                    </span>
                    <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              {operationRows.some(([, v]) => v) && (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <Label size="md" muted={false}>사업 운영 정보</Label>
                    <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
                  </div>
                  <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
                    {operationRows
                      .filter(([, v]) => v)
                      .map(([label, value]) => (
                        <div key={label} className="py-2 flex items-baseline justify-between">
                          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                            {label}
                          </span>
                          <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </section>
          </div>

          {rfp.memo && (
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-3">
                <Label size="md" muted={false}>견적 요청 세부 내용</Label>
                <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
              </div>
              <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed whitespace-pre-wrap">
                {rfp.memo}
              </p>
            </div>
          )}

          <div className="mt-6">
            <AttachmentPreviewList files={rfpFiles} />
          </div>
        </AccordionItem>
      </Accordion>

      {/* 견적 비교 — 포커스 + hover */}
      <FocusComparison
        bids={bids}
        pgWsNameMap={pgWsNameMap}
        current={{
          feeRate: rfp.currentFeeRate,
          settlementCycle: rfp.currentSettlementCycle,
          settlementLimit: rfp.currentSettlementLimit,
          guaranteeInsurance: rfp.currentGuaranteeInsurance,
        }}
        rfpStatus={rfp.status}
        awardedBidId={rfp.awardedBidId}
        requiredPaymentMethods={rfp.requiredPaymentMethods}
        customPaymentMethods={rfp.customPaymentMethods}
        rfpId={rfp.id}
        rfpCode={rfp.code}
        requoteByPg={requoteByPg}
        isSample={rfp.isSample ?? false}
      />

      {/* 'PG 초대 · 게시판 노출 관리' — 조건부 자동 펼침 */}
      <Accordion defaultValue={defaultOpen}>
        <AccordionItem
          value="pg-manage"
          title="PG 초대 · 게시판 노출 관리"
          badge={
            pendingCount > 0 ? <Chip label={`대기 ${pendingCount}건`} color="warning" /> : undefined
          }
        >
          <div className="space-y-6">
            <RfpInviteManager
              rfpId={rfp.code}
              invitations={inviteList}
              canEdit={canEdit}
            />
            <RfpBoardVisibilityToggle
              rfpCode={rfp.code}
              boardVisible={rfp.boardVisible ?? true}
              canEdit={canEdit}
            />
            <RfpPendingRequests requests={pendingRequests} canEdit={canEdit} />
          </div>
        </AccordionItem>
      </Accordion>
    </>
  );
}

RfpDetailContent.Skeleton = function RfpDetailContentSkeleton() {
  return (
    <>
      <div>
        <Skeleton className="h-3 w-24 mb-2" />
        <div className="flex items-start justify-between mt-1 gap-4">
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      <Skeleton className="h-12 w-full" />

      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-2 w-16" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <Skeleton className="h-9 w-64 mb-4" />
        <Skeleton className="h-48 w-full" />
      </section>

      <Skeleton className="h-12 w-full" />
    </>
  );
};
