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

export function AwardConfirmDialog({
  open,
  onOpenChange,
  rfpId,
  awardedBidId,
  pgName,
  otherCount,
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
  onAwarded?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      <DialogContent showCloseButton={false} className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{pgName}의 견적을 선정할까요?</DialogTitle>
          <DialogDescription>
            확정하면 선정 PG와 미선정 PG 모두에게 결과를 알리고, 견적 요청이 마감돼요.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-extra-small)] p-4">
          <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mb-2">
            확정 후 처리
          </p>
          <ul className="space-y-1.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            <li>· {pgName}와 계약을 진행해요</li>
            <li>· 미선정 PG {otherCount}곳에 결과를 알려요</li>
            <li>· 이후 견적 수정·철회는 할 수 없어요</li>
          </ul>
        </div>

        {error && (
          <p
            role="alert"
            className="md-label-small text-[var(--md-sys-color-error)]"
          >
            처리 실패 — {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outlined"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'LOADING…' : '선정할게요'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
