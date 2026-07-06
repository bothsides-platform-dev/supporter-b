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
    let trackedEl: HTMLElement | null = null;

    const updateRect = () => {
      if (cancelled || !trackedEl) return;
      setResult({ rect: trackedEl.getBoundingClientRect(), status: 'found' });
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
    };
  }, [target, timeoutMs]);

  return result;
}
