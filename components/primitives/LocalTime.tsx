'use client';

import { useState, useEffect } from 'react';
import { formatDateTime } from '@/lib/format';

interface LocalTimeProps {
  iso: string;
  format?: string;
  /** Explicit timezone override; defaults to browser's Intl timezone after hydration */
  timeZone?: string;
}

export function LocalTime({ iso, format = 'yyyy-MM-dd HH:mm', timeZone }: LocalTimeProps) {
  const [text, setText] = useState(() => formatDateTime(iso, 'Asia/Seoul', format));

  useEffect(() => {
    const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Hydration-safe: SSR/first render uses Asia/Seoul (deterministic), then we
    // correct to the browser/explicit timezone once after mount. This is the one
    // bounded post-hydration update, not the cascading re-render the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(formatDateTime(iso, tz, format));
  }, [iso, format, timeZone]);

  return <>{text}</>;
}

export function LocalDate({ iso, timeZone }: { iso: string; timeZone?: string }) {
  return <LocalTime iso={iso} format="yyyy. MM. dd." timeZone={timeZone} />;
}
