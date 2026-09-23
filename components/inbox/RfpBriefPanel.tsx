import { Paperclip } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { InfoTip } from '@/components/ui/info-tip';
import { CounterpartyProfileCard } from '@/components/messages/CounterpartyProfileCard';
import { toCounterparty } from '@/components/messages/types';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { MERCHANT_TIER_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/types/bid';
import {
  formatDate,
  formatDeadline,
  formatDeadlineLabel,
} from '@/lib/utils/format';
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPE_COLOR } from '@/lib/types/rfp';
import type { RFP } from '@/lib/types/rfp';
import type { WorkspaceDisplay } from '@/lib/types/workspace';
import { buildRfpOperationRows } from '@/lib/rfp/operation-rows';
import { formatBizNoDisplay } from '@/lib/utils/format';

// buyer 는 신원 한 덩어리로 받는다 — 상호명 문자열만 받던 시절 아바타가 로고를 잃었다.
type Props = { rfp: RFP; buyer: WorkspaceDisplay; onOpenAttachments?: () => void };

export function RfpBriefPanel({ rfp, buyer, onOpenAttachments }: Props) {
  const bizProfile = rfp.bizProfile;
  const bizNoMissing = !bizProfile?.bizNo;
  const grade = bizProfile?.grade;
  const daysLeft = formatDeadline(rfp.deadline);
  const isUrgent = daysLeft.startsWith('D-') && parseInt(daysLeft.slice(2)) <= 3;
  // 현재 카드 수수료 PG 노출(opt-out). false면 PG 화면에서만 숨김 — undefined는 노출로 취급.
  const pgCardFee = rfp.currentFeeVisibleToPg === false ? undefined : rfp.currentFeeRate;
  const operationRows = buildRfpOperationRows(rfp, pgCardFee);
  const paymentMethods = [
    ...rfp.requiredPaymentMethods.map((method) => ({ id: method, label: PAYMENT_METHOD_LABELS[method] })),
    ...rfp.customPaymentMethods,
  ];

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-6" data-coachmark="tutorial-brief-panel">
      {/* Header */}
      <div>
        <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)]">{rfp.code}</span>
        <h2 className="break-words text-[22px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] mt-0.5">
          {rfp.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`md-numeric text-[12px] font-medium ${isUrgent ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}
          >
            {formatDeadlineLabel(rfp.deadline)} ({formatDate(rfp.deadline)})
          </span>
          {rfp.contractType && (
            <Chip
              label={CONTRACT_TYPE_LABELS[rfp.contractType]}
              color={CONTRACT_TYPE_COLOR[rfp.contractType]}
            />
          )}
        </div>
      </div>

      {bizNoMissing && (
        <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-3 space-y-1">
          <Chip label="사업자번호 미입력" color="warning" />
          <p className="text-[12px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            사전 견적 또는 보완 예정 견적 요청 — 일반 등급 가정으로 9개 카드사별 견적을 작성해요.
          </p>
        </div>
      )}

      <section aria-label="구매사 정보" className="border-y border-[var(--md-sys-color-outline-variant)] py-4">
        <div className="flex items-center gap-3">
          <CounterpartyProfileCard
            variant="avatar"
            counterparty={toCounterparty(buyer)}
            rfpContext={{ id: rfp.id, title: rfp.title }}
          />
          <div className="min-w-0">
            <p className="mb-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">구매사 정보</p>
            <h3 className="break-words text-base font-semibold text-[var(--md-sys-color-on-surface)]">{buyer.name}</h3>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <dt className="text-[var(--md-sys-color-on-surface-variant)]">사업자번호</dt>
            <dd className="md-numeric text-[var(--md-sys-color-on-surface)]">{bizProfile?.bizNo ? formatBizNoDisplay(bizProfile.bizNo) : '미입력'}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt className="flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)]">
              가맹점 등급 <InfoTip term="가맹점등급" />
            </dt>
            <dd><Chip label={grade ? MERCHANT_TIER_LABELS[grade] : '미정'} color="surface" /></dd>
          </div>
        </dl>
      </section>

      {paymentMethods.length > 0 && (
        <section>
          <h3 className="mb-3 text-[14px] font-semibold text-[var(--md-sys-color-on-surface)]">요청 결제수단</h3>
          <ul aria-label="요청 결제수단" className="flex flex-wrap gap-2">
            {paymentMethods.map((method) => (
              <li key={method.id} className="max-w-full break-words rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-surface-container-low)] px-2.5 py-1 text-[14px] text-[var(--md-sys-color-on-surface)]">
                {method.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rfp.memo && (
        <section>
          <h3 className="mb-3 text-[14px] font-semibold text-[var(--md-sys-color-on-surface)]">견적 요청 세부 내용</h3>
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-[var(--md-sys-color-on-surface)]">{rfp.memo}</p>
        </section>
      )}

      {operationRows.some(([, value]) => value) && (
        <section className="border-t border-[var(--md-sys-color-outline-variant)] pt-5">
          <h3 className="mb-3 text-[14px] font-semibold text-[var(--md-sys-color-on-surface)]">사업 운영 정보</h3>
          <dl className="space-y-3">
            {operationRows.filter(([, value]) => value).map(([label, value]) => (
              <div key={label} className="grid grid-cols-1 gap-1 text-[14px] sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-[var(--md-sys-color-on-surface-variant)]">{label}</dt>
                <dd className={`min-w-0 break-words text-[var(--md-sys-color-on-surface)] ${['사업 운영 홈페이지', '주요 판매 상품', '현재 운영 솔루션', '입점 판매자', '환금성 상품', '판매 방식'].includes(label) ? '' : 'md-numeric'}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 구매사 첨부파일 — 미리보기 (없으면 렌더 안 함) */}
      {onOpenAttachments ? (
        rfp.rfpFiles.length > 0 && (
          <Button variant="outlined" icon={<Paperclip />} onClick={onOpenAttachments}>
            첨부파일 {rfp.rfpFiles.length}개 보기
          </Button>
        )
      ) : <AttachmentPreviewList files={rfp.rfpFiles} />}
    </div>
  );
}
