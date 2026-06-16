'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// 하단에서 이만큼(px) 이내면 "하단 근처"로 보고 새 메시지를 자동 추적한다.
export const NEAR_BOTTOM_PX = 120;

// 스크롤 메트릭으로 하단 근처 여부 판정(순수). 메트릭이 없으면(jsdom/초기) 호출처가
// 하단으로 간주하도록 별도 처리한다.
export function isNearBottomMetrics(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  threshold = NEAR_BOTTOM_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

// 새 메시지 append 시 하단 추적 — 최초 로드/본인 전송/하단 근처면 따라가고, 위로
// 올려둔 상태에서 상대 메시지가 오면 (withPill 일 때) "새 메시지" pill 만 띄운다.
// ThreadView(withPill=true) 와 TeamThreadView(withPill=false, pill 없음) 공용.
export function useStickToBottom({
  count,
  isOwnLast,
  withPill = false,
}: {
  count: number;
  isOwnLast: boolean;
  withPill?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);

  const isNearBottom = useCallback((): boolean => {
    const el = listRef.current;
    if (!el) return true; // 메트릭 없으면(초기/jsdom) 하단으로 간주
    return isNearBottomMetrics(el);
  }, []);

  const scrollToBottom = useCallback((): void => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
    setShowNewMessagePill(false);
  }, []);

  useEffect(() => {
    const grew = count > prevLenRef.current;
    const isInitial = prevLenRef.current === 0;
    prevLenRef.current = count;
    if (!grew) return;
    if (isInitial || isOwnLast || isNearBottom()) {
      scrollToBottom();
    } else if (withPill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 새 메시지 append 에 대한 의도된 반응: 위로 올려둔 상태에서 상대 메시지가 오면 점프 대신 pill 만 띄운다(grew 일 때만 1회).
      setShowNewMessagePill(true);
    }
  }, [count, isOwnLast, withPill, isNearBottom, scrollToBottom]);

  // 사용자가 직접 하단으로 스크롤하면 pill 을 거둔다.
  const onListScroll = useCallback((): void => {
    if (isNearBottom()) setShowNewMessagePill(false);
  }, [isNearBottom]);

  return { listRef, bottomRef, showNewMessagePill, scrollToBottom, onListScroll };
}
