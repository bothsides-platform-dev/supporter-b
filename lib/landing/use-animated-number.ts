'use client';

import { useEffect, useRef, useState } from 'react';
import { landingMotionUnavailable } from '@/lib/landing/prefers-reduced-motion';

const DEFAULT_DURATION_MS = 220;

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

// 값이 바뀔 때마다 표시 숫자를 이전 값에서 새 목표로 부드럽게 보간한다. 목표가
// 애니메이션 도중에 다시 바뀌어도(예: 슬라이더를 계속 드래그) "현재 표시값 → 새 목표"로
// 이어서 재시작하므로 끊기지 않는다. 마운트 시점에는 목표값을 즉시 반환한다(0에서부터
// 차오르지 않음) — 이 훅은 "값 변화"를 부드럽게 만드는 용도지, 진입 연출용이 아니다.
export function useAnimatedNumber(target: number, durationMs: number = DEFAULT_DURATION_MS): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    if (landingMotionUnavailable()) {
      displayRef.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    const to = target;
    if (from === to) return;

    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / durationMs);
      const value = from + (to - from) * easeOutCubic(p);
      displayRef.current = value;
      setDisplay(value);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}
