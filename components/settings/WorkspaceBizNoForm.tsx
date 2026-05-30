'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import {
  lookupBizNoAction,
  updateWorkspaceBizProfileAction,
} from '@/lib/server/actions/rfp';
import { toast } from '@/lib/toast';

const ntsLookup = async (bizNo: string) => {
  const r = await lookupBizNoAction(bizNo);
  if (!r.ok || !r.valid) return { valid: false as const };
  return {
    valid: true as const,
    taxType: r.taxType!,
    status: r.status!,
  };
};

type Props = {
  /** null = 사업자번호 미등록 (초기 등록 모드로 진입) */
  currentBizNo: string | null;
  /** 초기 등록 성공 후 이동할 URL (biz_required 흐름에서 /rfp/new 등) */
  returnUrl?: string;
};

export function WorkspaceBizNoForm({ currentBizNo, returnUrl }: Props) {
  // 미등록 상태(null)에서는 곧장 입력 UI 노출 — 별도 '수정' 버튼이 없으므로
  // 디폴트 editing=true.
  const [editing, setEditing] = useState(currentBizNo === null);
  const [next, setNext] = useState<BizLookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const dirty = next !== null && next.bizNo !== currentBizNo;

  const handleStartEdit = () => {
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setNext(null);
  };

  const handleSubmit = async () => {
    if (!dirty || submitting || !next) return;
    setSubmitting(true);
    const r = await updateWorkspaceBizProfileAction({
      bizProfile: {
        bizNo: next.bizNo,
        taxType: next.taxType,
        status: next.status,
      },
    });
    setSubmitting(false);
    if (!r.ok) {
      toast(`저장 실패 — ${r.error}`, { type: 'error' });
      return;
    }
    toast('사업자번호를 저장했습니다.');
    setEditing(false);
    setNext(null);
    if (isInitialRegistration && returnUrl) {
      startTransition(() => router.push(returnUrl));
    } else {
      startTransition(() => router.refresh());
    }
  };

  const isInitialRegistration = currentBizNo === null;

  return (
    <div className="space-y-4">
      {/* read-only 상태에서만 섹션 헤더 렌더 — edit 상태는 BizLookupField 자체 레이블 사용 */}
      {!editing && <Label size="md" muted={false}>사업자 등록번호</Label>}
      {!editing && currentBizNo !== null ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-y border-[var(--md-sys-color-outline-variant)] py-2.5">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            현재
          </span>
          <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
            <span className="text-[13px] text-[var(--md-sys-color-on-surface)] font-mono tabular-nums">
              {currentBizNo}
            </span>
            <button
              type="button"
              onClick={handleStartEdit}
              className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors shrink-0"
            >
              수정
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <BizLookupField
            onLookup={ntsLookup}
            onResult={(profile) => setNext(profile)}
            onReset={() => setNext(null)}
          />

          {next && next.bizNo === currentBizNo && (
            <p
              role="status"
              className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
            >
              현재 사업자번호와 동일합니다.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={!dirty || submitting}
              onClick={handleSubmit}
            >
              {submitting
                ? '저장 중…'
                : isInitialRegistration
                  ? '사업자번호 등록'
                  : '변경 적용'}
            </Button>
            {!isInitialRegistration && (
              <button
                type="button"
                onClick={handleCancel}
                className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
              >
                취소
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
