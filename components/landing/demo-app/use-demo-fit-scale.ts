'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

// 데모 창(box)의 실제 폭 대비 데스크톱 캔버스(designWidth) 축소 배율을 구한다.
// box < designWidth 이면 box/designWidth 로 축소해, 데스크톱 레이아웃을 고정 폭 캔버스에
// 그린 뒤 창에 맞게 줄여 셀 줄바꿈을 없앤다. box >= designWidth 이면 1(원본).
// box 미측정(0/undefined)이면 1 폴백 — SSR·초기 렌더에서 안전.
export function demoFitScale(boxWidth: number, designWidth: number): number {
  if (!boxWidth || boxWidth <= 0) return 1;
  return Math.min(1, boxWidth / designWidth);
}

// designWidth 고정 캔버스를 감싸는 데모 창(ref)의 폭을 관찰해 fit 배율을 돌려준다.
// offsetWidth 는 transform(진입 스케일) 영향을 받지 않아 스케일 전 레이아웃 폭을 준다.
export function useDemoFitScale(ref: RefObject<HTMLElement | null>, designWidth: number): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const compute = () => setScale(demoFitScale(ref.current?.offsetWidth ?? 0, designWidth));
    compute();
    window.addEventListener('resize', compute);

    // 창 자체 폭 변화(콘텐츠 레이아웃 시프트 등)에도 반응. jsdom 은 ResizeObserver 미구현이라 방어.
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(compute);
      ro.observe(ref.current);
    }
    return () => {
      window.removeEventListener('resize', compute);
      ro?.disconnect();
    };
  }, [ref, designWidth]);

  return scale;
}
