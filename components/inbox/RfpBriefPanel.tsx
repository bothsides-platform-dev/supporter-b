import { Chip } from '@/components/primitives/Chip';
import { Label } from '@/components/primitives/Label';
import { InfoTip } from '@/components/ui/info-tip';
import { MessageComposeButton } from '@/components/messages/MessageComposeButton';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import { formatDate, formatDeadline } from '@/lib/format';
import type { RFP } from '@/lib/types/rfp';

type Props = { rfp: RFP; buyerName: string };

export function RfpBriefPanel({ rfp, buyerName }: Props) {
  const bizProfile = rfp.bizProfile;
  const bizNoMissing = !bizProfile?.bizNo;
  const grade = bizProfile?.grade;
  const cardFee = grade ? STATUTORY_CARD_FEE[grade] : NaN;
  const daysLeft = formatDeadline(rfp.deadline);
  const isUrgent = daysLeft.startsWith('D-') && parseInt(daysLeft.slice(2)) <= 3;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{rfp.id}</span>
        <h2 className="text-[22px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] mt-0.5">
          {rfp.title}
        </h2>
        <div className="flex items-center gap-3 mt-2">
          <span
            className={`font-mono text-[12px] tabular-nums font-medium ${isUrgent ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}
          >
            마감 {daysLeft} ({formatDate(rfp.deadline)})
          </span>
        </div>
      </div>

      {bizNoMissing && (
        <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-3 space-y-1">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            [ 사업자번호 미입력 ]
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            사전 견적 또는 보완 예정 견적 요청 — 일반 등급 가정으로 9개 카드사별 견적을 작성해요.
          </p>
        </div>
      )}

      {/* Buyer biz info */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>구매사 정보</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          <MessageComposeButton
            variant="avatar"
            counterparty={{ name: buyerName, type: 'buyer', workspaceId: rfp.buyerWsId }}
            rfpContext={{ code: rfp.id, title: rfp.title }}
          />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {[
            ['상호명', buyerName],
            ['사업자번호', bizProfile?.bizNo ?? '미입력'],
            ['대표자', '—'],
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grade + statutory fee */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>가맹점 등급</Label>
          <InfoTip term="가맹점등급" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="flex items-center justify-between py-2.5 border-t border-[var(--md-sys-color-outline-variant)] border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="flex items-center gap-3">
            {grade ? (
              <>
                <Chip label={GRADE_LABELS[grade]} color="surface" />
                {!isNaN(cardFee) && (
                  <span className="font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                    카드 법정 {(cardFee * 100).toFixed(2)}%
                  </span>
                )}
                {isNaN(cardFee) && (
                  <span className="font-mono text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                    일반등급 — 카드사별 수수료 입력 필요
                  </span>
                )}
              </>
            ) : (
              <>
                <Chip label="미정" color="surface" />
                <span className="font-mono text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  등급 미입력 — 일반 가정으로 카드사별 수수료 입력 필요
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 사업 운영 정보 — 6 optional fields */}
      {[rfp.websiteUrl, rfp.mainProducts, rfp.annualPgVolume, rfp.currentFeeRate, rfp.currentSettlementLimit, rfp.currentGuaranteeInsurance, rfp.currentSettlementCycle].some(Boolean) && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Label size="md" muted={false}>사업 운영 정보</Label>
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {(
              [
                ['사업 운영 홈페이지', rfp.websiteUrl],
                ['주요 판매 상품', rfp.mainProducts],
                ['전년도 연간 PG 거래액', rfp.annualPgVolume],
                ['현재 카드 수수료', rfp.currentFeeRate],
                ['현재 정산한도', rfp.currentSettlementLimit],
                ['현재 보증보험', rfp.currentGuaranteeInsurance],
                ['현재 정산주기', rfp.currentSettlementCycle],
              ] as [string, string | undefined][]
            )
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="py-2.5 flex items-baseline justify-between">
                  <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
                  <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 견적 요청 세부 내용 */}
      {rfp.memo && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Label size="md" muted={false}>견적 요청 세부 내용</Label>
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed whitespace-pre-wrap">
            {rfp.memo}
          </p>
        </div>
      )}

      {/* 구매사 첨부파일 — 미리보기 (없으면 렌더 안 함) */}
      <AttachmentPreviewList files={rfp.rfpFiles} />
    </div>
  );
}
