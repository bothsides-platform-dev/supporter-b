'use client';

import { useCallback, useEffect, useRef } from 'react';

// 컴포저 textarea 자동 높이 상한(px) — 한 줄에서 시작해 내용에 따라 늘되 여기까지만.
// ChatComposerTextarea·TeamThreadView 공용 단일 출처(매직넘버 분산 방지).
export const MAX_GROW_PX = 160;

/**
 * 컴포저 textarea 자동 높이 메커니즘.
 * `resize()` 를 onChange 에서 호출하면 내용에 맞춰 높이를 늘리되 `maxPx` 에서 멈춘다.
 * `value` 가 빈 문자열로 바뀌면(전송 후) 높이를 한 줄로 되돌린다.
 */
export function useAutoGrowTextarea(value: string, maxPx: number = MAX_GROW_PX) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 전송 후 value 가 비면 높이를 한 줄로 리셋(각 컴포저의 수동 리셋 대체).
  useEffect(() => {
    const el = ref.current;
    if (el && value === '') el.style.height = 'auto';
  }, [value]);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
  }, [maxPx]);

  return { ref, resize };
}
