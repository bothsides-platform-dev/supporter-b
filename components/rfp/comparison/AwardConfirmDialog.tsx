'use client';

// 인라인 선정 확정 다이얼로그 — 포커스 뷰 CTA 가 연다. 화면에 이미 있는 견적으로 충분해
// 추가 fetch 없음. awardRfpAction 재사용(서버 로직 불변). 성공 시 onAwarded 로 부모에
// 알리고(현재 호출부는 선정 결과 화면을 띄움) 닫는다. 실패 시 에러를 인라인 노출.
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { awardRfpAction } from '@/lib/server/actions/rfp';
import { LONG_TERM_AGREEMENTS_ENABLED } from '@/lib/features/long-term-agreements';
import { AgreementConditions } from '@/components/deal-room/signing/AgreementConditions';
import { getMethodRate, type Bid, type MerchantTier } from '@/lib/types/bid';
import { formatKRW, formatPct } from '@/lib/utils/format';

const AWARD_ERROR_LABELS: Record<string, string> = {
  WINNING_BID_OUTDATED: '최신 견적이 도착했어요. 화면을 새로고침한 뒤 최신 견적을 골라 주세요.',
};

export function AwardConfirmDialog({
  open,
  onOpenChange,
  rfpId,
  awardedBidId,
  pgName,
  otherCount,
  selectedBid,
  buyerGrade,
  pendingRequote = false,
  onAwarded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** uuid — awardRfpAction 용 */
  rfpId: string;
  awardedBidId: string;
  pgName: string;
  /** 미선정으로 결과를 받게 될 다른 PG 수 */
  otherCount: number;
  selectedBid: Bid;
  buyerGrade?: MerchantTier;
  pendingRequote?: boolean;
  onAwarded?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const cardRate = getMethodRate(selectedBid.paymentFees.card, buyerGrade ?? 'general');

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    const r = await awardRfpAction({ rfpId, awardedBidId });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onAwarded?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{pgName}의 견적을 선정할까요?</DialogTitle>
          <DialogDescription>
            확정하면 선정 PG와 미선정 PG 모두에게 결과를 알리고, 견적 요청이 마감돼요.
          </DialogDescription>
          {pendingRequote && <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">수정 견적을 기다리지 않고 현재 견적을 선정해요.</p>}
        </DialogHeader>

        <section aria-label="선정할 견적의 핵심 조건" className="space-y-2 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4">
          <h3 className="text-[14px] font-semibold">선정할 견적의 핵심 조건</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-[var(--md-sys-color-on-surface-variant)]">카드 수수료{buyerGrade ? ' · 현재 등급' : ''}</dt>
            <dd className="text-right">{cardRate === undefined ? '견적에서 확인해요' : <span className="md-numeric">{formatPct(cardRate)}</span>}</dd>
            <dt className="text-[var(--md-sys-color-on-surface-variant)]">정산주기</dt>
            <dd className="md-numeric text-right">{selectedBid.settleCycle}</dd>
            <dt className="text-[var(--md-sys-color-on-surface-variant)]">월 정산한도</dt>
            <dd className="md-numeric text-right">{formatKRW(selectedBid.settleLimit)}</dd>
            <dt className="text-[var(--md-sys-color-on-surface-variant)]">보증보험</dt>
            <dd className="md-numeric text-right">{formatKRW(selectedBid.guaranteeInsurance)}</dd>
            <dt className="text-[var(--md-sys-color-on-surface-variant)]">가입비</dt>
            <dd className="text-right">{selectedBid.signupFee > 0 ? <span className="md-numeric">{formatKRW(selectedBid.signupFee)}</span> : '없어요'}</dd>
          </dl>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">다른 결제수단과 등급별 요율은 견적 비교에서 확인할 수 있어요.</p>
        </section>

        <div className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-extra-small)] p-4">
          <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mb-2">
            확정 후 처리
          </p>
          <ul className="space-y-1.5 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
            <li>· {pgName}와 계약을 진행해요</li>
            <li>· 미선정 PG {otherCount}곳에 결과를 알려요</li>
            <li>· 이후 견적 수정·철회는 할 수 없어요</li>
          </ul>
        </div>

        {LONG_TERM_AGREEMENTS_ENABLED && <AgreementConditions beforeAward />}

        {error && (
          <p
            role="alert"
            className="md-label-small text-[var(--md-sys-color-error)]"
          >
            {AWARD_ERROR_LABELS[error] ?? `처리 실패 — ${error}`}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outlined"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            닫기
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={submitting}>
            {submitting ? '처리 중…' : '선정할게요'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
