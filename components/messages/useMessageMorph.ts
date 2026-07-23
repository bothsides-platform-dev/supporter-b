'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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

// 클론을 가둘 채팅 패널 경계. ThreadView·TeamThreadView 루트가 이 속성을 달고,
// 클론이 패널 밖 크롬(딜룸 모달 헤더 등) 위를 가로지르지 않게 한다.
const BOUNDS_SELECTOR = '[data-morph-bounds]';

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
  // 예약 큐는 ref + 신호용 tick 으로 나눠 든다.
  //   - 큐를 상태로 들면 측정 effect 가 끝날 때마다 큐를 비우려 setState 를 불러야 하고,
  //     그 자체로 캐스케이드 렌더가 된다(react-hooks/set-state-in-effect).
  //   - 큐는 렌더 결과에 쓰이지 않는 "소진할 작업 목록"일 뿐이라 ref 가 맞다. 상태로는
  //     "소진할 게 생겼다"는 신호(tick)만 올려 effect 를 깨운다.
  // 큐인 것이 핵심이다 — 단일 슬롯이면 같은 틱의 두 번째 전송이 첫 번째를 덮어써
  // 앞 메시지가 애니메이션 없이 튀어나온다.
  const queueRef = useRef<PendingFlight[]>([]);
  const [queueTick, setQueueTick] = useState(0);

  /**
   * 전송 시점에 1회 호출 — 텍스트가 아직 입력창에 있는 지금(낙관적 append·clear 전)
   * 출발 위치를 측정해 예약한다. 측정 실패·빈 텍스트면 조용히 no-op(즉시 표시 폴백).
   */
  const scheduleFlight = useCallback(
    (fromEl: Element | null | undefined, key: string, text: string): void => {
      const from = toRect(fromEl);
      if (!from || text.trim().length === 0) return;
      queueRef.current = [...queueRef.current, { key, text, from }];
      setQueueTick((n) => n + 1);
    },
    [],
  );

  /** 비행 완료·전송 실패 롤백 공용 정리 — 진행 중 클론과 미발동 예약을 함께 거둔다. */
  const endFlight = useCallback((key: string): void => {
    setFlights((prev) => prev.filter((f) => f.key !== key));
    queueRef.current = queueRef.current.filter((p) => p.key !== key);
  }, []);

  /**
   * 진행 중인 클론을 전부 포기한다 — 호출처가 말풍선 목록을 통째로 갈아끼워 morph
   * 타깃 키가 더는 유효하지 않을 때(ThreadView 의 messages prop 리싱크). 클론만 남고
   * 실 말풍선이 드러나는 이중 표시를 막는다.
   *
   * 큐는 건드리지 않는다 — 목록이 갈리면 예약이 노리던 `data-bubble-key` 도 함께
   * 사라져 측정이 실패하므로 예약은 스스로 취소된다. 덕분에 이 함수는 setState 하나뿐이라
   * 렌더 도중(리싱크 분기) 호출해도 안전하고, 이미 비어 있으면 같은 참조를 돌려줘
   * 업데이트를 bail out 한다(재렌더 루프 없음).
   */
  const clearFlights = useCallback((): void => {
    setFlights((prev) => (prev.length ? [] : prev));
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
      // 클론을 가둘 패널 경계 — 없으면 null(무클리핑 폴백). 도착 위치와 같은 시점에
      // 재야 자동 스크롤·레이아웃이 반영된 좌표계에서 서로 맞는다.
      const clip = toRect(listRef.current?.closest(BOUNDS_SELECTOR));
      setFlights((prev) =>
        prev.some((f) => f.key === p.key)
          ? prev
          : [...prev, { key: p.key, text: p.text, to: to as Rect, dx: t.dx, dy: t.dy, scale: t.scale, clip }],
      );
    },
    [reduce, listRef],
  );

  // 낙관적 말풍선이 DOM 에 안착하고 useStickToBottom 자동 스크롤이 적용된 뒤 위치를
  // 측정해 morph 를 발동한다(훅 선언 순서가 곧 effect 실행 순서 — 위 JSDoc 참조).
  // 큐는 ref 라 여기서 그냥 비우면 된다 — 상태 갱신 없이 1회성이 보장된다.
  useEffect(() => {
    const queue = queueRef.current;
    if (queue.length === 0) return;
    queueRef.current = [];
    for (const p of queue) {
      const bubbleEl = listRef.current?.querySelector<HTMLElement>(`[data-bubble-key="${p.key}"]`);
      beginFlight(p, bubbleEl);
    }
  }, [queueTick, beginFlight, listRef]);

  // <MorphFlightLayer {...layerProps} renderText={…} /> 로 스프레드하는 표면.
  const layerProps = useMemo(() => ({ flights, onDone: endFlight }), [flights, endFlight]);

  return { isMorphing, scheduleFlight, endFlight, clearFlights, layerProps };
}
