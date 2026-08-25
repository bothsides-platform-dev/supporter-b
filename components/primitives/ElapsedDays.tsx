'use client';

import { useEffect, useState } from 'react';
import { elapsedCalendarDays } from '@/lib/utils/format';

/**
 * "보낸 지 N일째" — 어떤 시점 이후 KST 달력일로 며칠이 지났는지.
 *
 * **SSR 에서는 아무것도 그리지 않는다.** 경과일은 `now` 에 의존하므로 서버 렌더와
 * 하이드레이션 사이에 날짜 경계를 넘으면 값이 달라져 불일치가 난다(레포가
 * `PgHeroProductWindow` 에 같은 함정을 기록해 뒀다). `LocalTime` 은 SSR 에서 KST 로
 * 그린 뒤 마운트 후 보정할 수 있지만 — 그건 **타임존**만 달라지기 때문이다 — 이쪽은
 * 기준 시각 자체가 달라서 보정할 초깃값이 없다. 그래서 마운트 후에만 그린다.
 */
export function ElapsedDays({ since, prefix = '보낸 지' }: { since: string; prefix?: string }) {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDays(elapsedCalendarDays(since, new Date()));
  }, [since]);

  if (days === null) return null;
  return (
    <>
      {prefix} <span className="md-numeric">{days}</span>일째
    </>
  );
}
