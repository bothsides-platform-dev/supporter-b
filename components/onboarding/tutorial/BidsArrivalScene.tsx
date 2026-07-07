'use client';

// buyer 튜토리얼 — "견적 요청을 보냈어요" 가상 시간 스킵 연출. 3사 견적 요약 카드가
// 0.6s 간격으로 순차 등장(opacity/transform만 — Linear 모션 하드룰)한다.
// prefers-reduced-motion 이면 전부 즉시 표시. 모두 등장 후 "견적 비교하기" CTA.
import { useEffect, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

const STAGGER_MS = 600;

export function BidsArrivalScene({
  pgNames,
  onProceed,
}: {
  pgNames: string[];
  onProceed: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced-motion 선호 시 전부 즉시 표시하는 의도된 동기화
      setVisibleCount(pgNames.length);
      return;
    }
    const timers = pgNames.map((_, i) =>
      setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), STAGGER_MS * (i + 1)),
    );
    return () => {
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pgNames는 마운트 시 고정된 fixture 목록
  }, []);

  const allArrived = visibleCount >= pgNames.length;

  return (
    <div className="flex flex-col items-center gap-6 px-8 py-10 text-center">
      <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
        견적 요청을 보냈어요
      </h2>
      <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
        초대한 PG들이 견적을 보내오고 있어요.
      </p>

      <div className="flex w-full max-w-md flex-col gap-3">
        {pgNames.map((name, i) => {
          const visible = i < visibleCount;
          return (
            <div
              key={name}
              className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-left transition-[opacity,transform] duration-300"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(8px)',
              }}
            >
              <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
                {name}
              </p>
              <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                견적을 보냈어요
              </p>
            </div>
          );
        })}
      </div>

      {allArrived && (
        <Button onClick={onProceed}>견적 비교하기</Button>
      )}
    </div>
  );
}
