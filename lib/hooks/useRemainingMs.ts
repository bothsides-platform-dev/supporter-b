'use client';

import { useEffect, useState } from 'react';

/**
 * `until`(ISO 8601)까지 남은 ms — 지났거나 값이 없으면 null.
 *
 * **마운트 후에만 값을 낸다**(SSR·첫 렌더는 null). 남은 시간은 `now` 에 의존해 서버
 * 렌더와 하이드레이션 사이에 달라지므로 보정할 초깃값이 없다(`ElapsedDays` 와 같은
 * 이유). 분 단위 표시가 낡지 않도록 최대 1분마다, 그리고 만료 시각에 정확히 갱신한다.
 */
export function useRemainingMs(until?: string): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const end = until ? Date.parse(until) : NaN;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const left = end - Date.now();
      if (!(left > 0)) {
        setRemaining(null);
        return;
      }
      setRemaining(left);
      timer = setTimeout(tick, Math.min(left, 60_000));
    };
    tick();
    return () => clearTimeout(timer);
  }, [until]);

  return remaining;
}
