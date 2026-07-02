'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

// 요소가 확대될 수 있는 최댓값을 현재 window 너비 안으로 제한한다.
// designMax(디자인 목표 배율, 예: 1.1)를 넘기지 않되, 그 배율을 곱한 실제 너비가
// window 너비를 넘어서는 뷰포트에서는 window 경계에 닿는 지점까지만 배율을 낮춘다.
// offsetWidth는 transform 영향을 받지 않으므로 스케일 전 실제 레이아웃 너비를 그대로 준다.
// window.innerWidth 대신 document.documentElement.clientWidth를 쓴다 — innerWidth는
// 세로 스크롤바 너비를 포함해(오버레이 스크롤바인 macOS에서는 차이가 없지만, 기본
// 스크롤바를 쓰는 Windows 등에서는 15px 안팎 차이) 그만큼 상한을 과대평가해 다시
// 잘리는 문제가 생긴다. clientWidth는 스크롤바를 제외한 실제 콘텐츠 영역 너비다.
export function useCappedEntryScale(ref: RefObject<HTMLElement | null>, designMax: number): number {
  const [scale, setScale] = useState(designMax);

  useLayoutEffect(() => {
    const compute = () => {
      const width = ref.current?.offsetWidth;
      if (!width) return;
      setScale(Math.min(designMax, document.documentElement.clientWidth / width));
    };
    compute();
    window.addEventListener('resize', compute);

    // Also react to the observed element's own width changes independently
    // of window resize (e.g. future content-driven layout shifts). jsdom
    // (the test environment) does not implement ResizeObserver, so guard
    // defensively — real browsers always have it.
    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      resizeObserver = new ResizeObserver(compute);
      resizeObserver.observe(ref.current);
    }

    return () => {
      window.removeEventListener('resize', compute);
      resizeObserver?.disconnect();
    };
  }, [ref, designMax]);

  return scale;
}
