'use client';

import { useCallback, useState } from 'react';
import { computeMorphTransform, shouldMorph, type Flight, type Rect } from './message-morph';

function toRect(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// 전송 morph 상태 보유 + 발동/측정/종료. ThreadView·TeamThreadView 공용.
// beginFlight 는 말풍선이 DOM 에 안착하고 자동 스크롤이 적용된 뒤 호출해야 한다
// (호출처에서 useStickToBottom 뒤에 선언한 effect 에서 부른다).
export function useMessageMorph() {
  const [flights, setFlights] = useState<Flight[]>([]);

  const beginFlight = useCallback(
    (args: {
      key: string;
      text: string;
      from: Rect | null;
      isSelf: boolean;
      reduce: boolean;
      bubbleEl: Element | null | undefined;
    }): void => {
      const to = toRect(args.bubbleEl);
      const hasText = args.text.trim().length > 0;
      if (!args.from || !shouldMorph({ isSelf: args.isSelf, hasText, reduce: args.reduce, to })) return;
      const t = computeMorphTransform(args.from, to as Rect); // shouldMorph 통과 → to non-null
      setFlights((prev) =>
        prev.some((f) => f.key === args.key)
          ? prev
          : [...prev, { key: args.key, text: args.text, to: to as Rect, dx: t.dx, dy: t.dy, scale: t.scale }],
      );
    },
    [],
  );

  const endFlight = useCallback((key: string): void => {
    setFlights((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const isMorphing = useCallback((key: string): boolean => flights.some((f) => f.key === key), [flights]);

  return { flights, beginFlight, endFlight, isMorphing };
}
