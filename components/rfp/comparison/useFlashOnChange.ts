'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * dep 이 바뀔 때마다 `ms` 동안 `true` 를 반환한다.
 * 초기 마운트 시에는 flash 하지 않는다(첫 렌더 강조 방지).
 * 스태거 delay 는 소비 측에서 CSS animation-delay 로 적용.
 */
export function useFlashOnChange(dep: unknown, ms = 550): boolean {
  const [flashing, setFlashing] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), ms);
    return () => clearTimeout(t);
    // dep 변경만 추적 — ms 는 의도적으로 제외(초기값 고정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);

  return flashing;
}
