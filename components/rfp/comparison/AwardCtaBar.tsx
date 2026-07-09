'use client';

// 포커스 비교 하단 CTA — 견적 재요청 + 선정하기. 표현 전용; 다이얼로그 열기는
// 부모 콜백. memo 로 감싸 무관 재렌더를 줄인다.
import { memo } from 'react';
import { Button } from '@/components/primitives/Button';

function AwardCtaBarImpl({
  canAward,
  showRequote = true,
  onRequote,
  onAward,
}: {
  canAward: boolean;
  /** false면 재요청 버튼을 숨긴다 — 가상 샘플 온보딩의 가짜 선정은 선정 CTA만 노출. */
  showRequote?: boolean;
  onRequote: () => void;
  onAward: () => void;
}) {
  if (!canAward) return null;
  return (
    <div className="pt-4 flex items-center justify-end gap-2">
      {showRequote && <Button variant="outlined" onClick={onRequote}>견적 재요청</Button>}
      <Button data-coachmark="tutorial-award-cta" onClick={onAward}>이 견적 선정하기 →</Button>
    </div>
  );
}

export const AwardCtaBar = memo(AwardCtaBarImpl);
