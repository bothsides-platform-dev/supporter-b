'use client';

// 포커스 비교 하단 CTA — 견적 재요청 + 선정하기. 표현 전용; 다이얼로그 열기는
// 부모 콜백. memo 로 감싸 무관 재렌더를 줄인다.
import { memo } from 'react';
import { Button } from '@/components/primitives/Button';
import { cn } from '@/lib/utils';

function AwardCtaBarImpl({
  canAward,
  showRequote = true,
  onRequote,
  onAward,
  pgName,
  docked = false,
}: {
  canAward: boolean;
  /** false면 재요청 버튼을 숨긴다 — 가상 샘플 온보딩의 가짜 선정은 선정 CTA만 노출. */
  showRequote?: boolean;
  onRequote: () => void;
  onAward: () => void;
  pgName?: string;
  docked?: boolean;
}) {
  if (!canAward) return null;
  return (
    <div
      role="group"
      aria-label="견적 선정"
      className={cn(
        '@container/award',
        docked
          ? 'border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pr-20 sm:pl-6 lg:pr-6'
          : 'mt-5 border-t border-[var(--md-sys-color-outline-variant)] pt-4',
      )}
    >
      <div className="flex flex-col gap-3 @min-[540px]/award:flex-row @min-[540px]/award:items-center @min-[540px]/award:justify-between">
        {pgName && (
          <p className="min-w-0 text-[14px] font-semibold text-[var(--md-sys-color-on-surface)] [overflow-wrap:anywhere]">
            {pgName}
            <span className="mt-0.5 hidden text-[13px] font-normal text-[var(--md-sys-color-on-surface-variant)] @min-[540px]/award:block">
              선정 전 조건을 한 번 더 확인해요
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 @min-[540px]/award:shrink-0">
          {showRequote && <Button type="button" className="h-auto min-h-11 py-2 touch-manipulation" data-coachmark="demo-requote" variant="outlined" onClick={onRequote}>수정 요청</Button>}
          <Button type="button" className="h-auto min-h-11 flex-1 py-2 touch-manipulation @min-[540px]/award:flex-none" data-coachmark="tutorial-award-cta" onClick={onAward}>이 견적 선정하기</Button>
        </div>
      </div>
    </div>
  );
}

export const AwardCtaBar = memo(AwardCtaBarImpl);
