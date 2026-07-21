'use client';

import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { computeMorphTransform, shouldMorph, type Flight, type Rect } from './message-morph';

function toRect(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// 발동 대기 중인 morph 예약 — 입력창을 비우기 전에 측정한 출발 위치를 들고 있다가,
// 말풍선이 안착한 뒤(아래 effect) 도착 위치를 재서 실제 flight 로 승격된다.
type PendingFlight = { key: string; text: string; from: Rect };

/**
 * 전송 morph 오케스트레이션 — ThreadView·TeamThreadView 공용.
 *
 * 예약·측정·발동·정리를 전부 이 훅이 소유한다. 호출처는 전송 시 `scheduleFlight` 를
 * 한 번 부르고 `layerProps` 를 `<MorphFlightLayer>` 에 넘기기만 하면 된다.
 *
 * **`useStickToBottom` 뒤에 선언해야 한다** — 측정 effect 가 자동 스크롤이 적용된
 * 뒤에 실행돼야 도착 위치가 맞는다(둘 다 passive, 선언 순서 = 실행 순서).
 * `listRef` 를 인자로 받는 것이 이 순서를 데이터 의존성으로 강제한다.
 */
export function useMessageMorph({ listRef }: { listRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [pending, setPending] = useState<PendingFlight | null>(null);

  /**
   * 전송 시점에 1회 호출 — 텍스트가 아직 입력창에 있는 지금(낙관적 append·clear 전)
   * 출발 위치를 측정해 예약한다. 측정 실패·빈 텍스트면 조용히 no-op(즉시 표시 폴백).
   */
  const scheduleFlight = useCallback(
    (fromEl: Element | null | undefined, key: string, text: string): void => {
      const from = toRect(fromEl);
      if (!from || text.trim().length === 0) return;
      setPending({ key, text, from });
    },
    [],
  );

  /** 비행 완료·전송 실패 롤백 공용 정리 — 진행 중 클론과 미발동 예약을 함께 거둔다. */
  const endFlight = useCallback((key: string): void => {
    setFlights((prev) => prev.filter((f) => f.key !== key));
    setPending((prev) => (prev?.key === key ? null : prev));
  }, []);

  const isMorphing = useCallback(
    (key: string): boolean => flights.some((f) => f.key === key),
    [flights],
  );

  // 도착 위치 측정 → 발동. 발동 판정은 shouldMorph 단일 출처에 맡긴다(isSelf 는 이 훅의
  // 불변식 — scheduleFlight 는 본인이 보낸 메시지에서만 호출된다).
  const beginFlight = useCallback(
    (p: PendingFlight, bubbleEl: Element | null | undefined): void => {
      const to = toRect(bubbleEl);
      const hasText = p.text.trim().length > 0;
      if (!shouldMorph({ isSelf: true, hasText, reduce: reduce ?? false, to })) return;
      const t = computeMorphTransform(p.from, to as Rect); // shouldMorph 통과 → to non-null
      setFlights((prev) =>
        prev.some((f) => f.key === p.key)
          ? prev
          : [...prev, { key: p.key, text: p.text, to: to as Rect, dx: t.dx, dy: t.dy, scale: t.scale }],
      );
    },
    [reduce],
  );

  // 낙관적 말풍선이 DOM 에 안착하고 useStickToBottom 자동 스크롤이 적용된 뒤 위치를
  // 측정해 morph 를 발동한다(훅 선언 순서가 곧 effect 실행 순서 — 위 JSDoc 참조).
  useEffect(() => {
    if (!pending) return;
    const bubbleEl = listRef.current?.querySelector<HTMLElement>(`[data-bubble-key="${pending.key}"]`);
    beginFlight(pending, bubbleEl);
    // 예약은 1회성 — 측정이 끝났으면 발동 여부와 무관하게 비운다(바운드된 후속 렌더 1회).
    setPending(null);
  }, [pending, beginFlight, listRef]);

  // <MorphFlightLayer {...layerProps} renderText={…} /> 로 스프레드하는 표면.
  const layerProps = useMemo(() => ({ flights, onDone: endFlight }), [flights, endFlight]);

  return { isMorphing, scheduleFlight, endFlight, layerProps };
}
