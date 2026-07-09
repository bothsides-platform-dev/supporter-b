'use client';

import { useEffect, useRef, useState } from 'react';

export type AnchorStatus = 'searching' | 'found' | 'notFound';

export type AnchorRectResult = {
  rect: DOMRect | null;
  status: AnchorStatus;
};

const DEFAULT_TIMEOUT_MS = 3000;

function queryTarget(target: string): HTMLElement | null {
  return document.querySelector(`[data-coachmark="${target}"]`);
}

/**
 * data-coachmark 속성으로 화면 요소를 찾아 그 위치(DOMRect)를 추적한다.
 * 요소가 아직 DOM에 없으면 MutationObserver로 등장을 기다리고, timeoutMs
 * 안에 못 찾으면 notFound로 전환한다(투어가 무한정 멈추지 않도록).
 */
export function useAnchorRect(
  target: string | null,
  options?: { timeoutMs?: number },
): AnchorRectResult {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [result, setResult] = useState<AnchorRectResult>({ rect: null, status: 'searching' });
  const scrolledRef = useRef(false);

  useEffect(() => {
    scrolledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- target 변경 시 이전 결과를 즉시 리셋하는 의도된 동기화
    setResult({ rect: null, status: 'searching' });

    if (!target) return;

    let cancelled = false;
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let pollId: ReturnType<typeof setInterval> | undefined;
    let trackedEl: HTMLElement | null = null;

    let lastKey = '';
    const updateRect = () => {
      if (cancelled || !trackedEl) return;
      // 같은 target 문자열이 유지된 채 요소가 리마운트되면(위저드 리렌더) 추적이
      // 분리된 요소에 남아 rect가 동결된다 — 폴 tick에서 재query해 재부착한다.
      // scrollIntoView는 재발사하지 않는다(scrolledRef가 이미 true).
      if (!trackedEl.isConnected) {
        const replacement = queryTarget(target);
        if (!replacement) return; // 다음 tick/MutationObserver에서 재시도
        trackedEl = replacement;
        resizeObserver?.disconnect();
        resizeObserver?.observe(replacement);
      }
      const rect = trackedEl.getBoundingClientRect();
      // 동일 rect 재-set 방지 — 폴링이 매 tick 불필요한 리렌더를 만들지 않도록.
      const key = `${rect.top},${rect.left},${rect.width},${rect.height}`;
      if (key === lastKey) return;
      lastKey = key;
      setResult({ rect, status: 'found' });
    };

    const attach = (el: HTMLElement) => {
      if (cancelled) return;
      trackedEl = el;
      mutationObserver?.disconnect();
      if (timeoutId) clearTimeout(timeoutId);

      if (!scrolledRef.current) {
        scrolledRef.current = true;
        el.scrollIntoView({ block: 'center' });
      }

      updateRect();

      window.addEventListener('resize', updateRect);
      window.addEventListener('scroll', updateRect, { capture: true });

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateRect);
        resizeObserver.observe(el);
      }

      // 스크롤/리사이즈 이벤트 없이 형제 요소 리플로우로 타깃 "위치"만 밀리는 경우
      // (ResizeObserver 는 타깃 자신의 크기 변화만 감지) — 저빈도 폴링으로 보정한다.
      pollId = setInterval(updateRect, 250);
    };

    const existing = queryTarget(target);
    if (existing) {
      attach(existing);
    } else {
      mutationObserver = new MutationObserver(() => {
        const found = queryTarget(target);
        if (found) attach(found);
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });

      timeoutId = setTimeout(() => {
        if (cancelled || trackedEl) return;
        mutationObserver?.disconnect();
        setResult({ rect: null, status: 'notFound' });
      }, timeoutMs);
    }

    return () => {
      cancelled = true;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, { capture: true });
      if (timeoutId) clearTimeout(timeoutId);
      if (pollId) clearInterval(pollId);
    };
  }, [target, timeoutMs]);

  return result;
}
