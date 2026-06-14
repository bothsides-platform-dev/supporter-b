'use client';

import { useState, useEffect } from 'react';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

// 여러 값을 일정 간격으로 순환시키며 활성 인덱스를 돌려준다(히어로 두 카피 크로스페이드).
// 항목이 1개 이하이거나 동작 줄이기 선호 시에는 0에 고정해 애니메이션을 생략한다.
export function useCrossFadeRotation(length: number, intervalMs = 4200): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length <= 1 || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [length, intervalMs]);

  return index;
}
