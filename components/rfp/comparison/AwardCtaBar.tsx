'use client';

// 포커스 비교 하단 CTA — 견적 재요청 + 선정하기. 샘플 샌드박스면 선정 불가 안내로
// 대체된다. 표현 전용; 다이얼로그 열기는 부모 콜백. memo 로 감싸 무관 재렌더를 줄인다.
import { memo } from 'react';
import { Button } from '@/components/primitives/Button';

function AwardCtaBarImpl({
  canAward,
  isSample,
  showRequote = true,
  onRequote,
  onAward,
}: {
  canAward: boolean;
  isSample?: boolean;
  /** false면 재요청 버튼을 숨긴다 — 가상 샘플 온보딩의 가짜 선정은 선정 CTA만 노출. */
  showRequote?: boolean;
  onRequote: () => void;
  onAward: () => void;
}) {
  return (
    <>
      {canAward && (
        <div className="pt-4 flex items-center justify-end gap-2">
          {showRequote && <Button variant="outlined" onClick={onRequote}>견적 재요청</Button>}
          <Button onClick={onAward}>이 견적 선정하기 →</Button>
        </div>
      )}
      {isSample && !canAward && (
        <div className="pt-4 flex justify-end">
          <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            샘플에서는 선정할 수 없어요. 실제 견적 요청을 보내보세요.
          </p>
        </div>
      )}
    </>
  );
}

export const AwardCtaBar = memo(AwardCtaBarImpl);
