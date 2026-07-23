'use client';

import { useEffect, useRef, useState } from 'react';

import { coachmarkSelector } from './coachmark-selector';

export type AnchorStatus = 'searching' | 'found' | 'notFound';

export type AnchorRectResult = {
  rect: DOMRect | null;
  status: AnchorStatus;
  disabled: boolean;
};

const DEFAULT_TIMEOUT_MS = 3000;
// 형제 리플로우 보정 폴링 주기 — CoachmarkTour의 오프코스 리졸버가 같은 리듬으로 동기화한다.
export const COACHMARK_POLL_MS = 250;

function isDisabledEl(el: HTMLElement): boolean {
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
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
  const [result, setResult] = useState<AnchorRectResult>({
    rect: null,
    status: 'searching',
    disabled: false,
  });
  const scrolledRef = useRef(false);

  useEffect(() => {
    scrolledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- target 변경 시 이전 결과를 즉시 리셋하는 의도된 동기화
    setResult({ rect: null, status: 'searching', disabled: false });

    if (!target) return;

    // target 은 이펙트 수명 동안 상수 — 셀렉터 문자열(CSS.escape 포함)을 한 번만
    // 만들어 스크롤/폴 tick 마다 재조립하지 않는다.
    const selector = coachmarkSelector(target);
    const queryTarget = () => document.querySelector<HTMLElement>(selector);

    let cancelled = false;
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let pollId: ReturnType<typeof setInterval> | undefined;
    let trackedEl: HTMLElement | null = null;

    let lastKey = '';
    let detachedSinceMs: number | null = null;
    const updateRect = () => {
      if (cancelled || !trackedEl) return;
      // 같은 target 문자열이 유지된 채 요소가 리마운트되면(위저드 리렌더) 추적이
      // 분리된 요소에 남아 rect가 동결된다 — 폴 tick에서 재query해 재부착한다.
      // 같은 노드의 data-coachmark 속성만 변이하는 경우(BidWizard 푸터 버튼)도
      // isConnected는 계속 true라 matches 재검증으로 잡는다.
      // scrollIntoView는 재발사하지 않는다(scrolledRef가 이미 true).
      if (!trackedEl.isConnected || !trackedEl.matches(selector)) {
        const replacement = queryTarget();
        if (!replacement) {
          // 대체 요소가 영원히 안 나타나면 스포트라이트가 허공에 얼어붙는다 —
          // timeoutMs 경과 시 notFound로 전환해 투어의 자동 스킵 불변식에 합류.
          detachedSinceMs ??= Date.now();
          if (Date.now() - detachedSinceMs >= timeoutMs) {
            resizeObserver?.disconnect();
            if (pollId) clearInterval(pollId);
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, { capture: true });
            setResult({ rect: null, status: 'notFound', disabled: false });
          }
          return; // 다음 tick에서 재시도
        }
        detachedSinceMs = null;
        trackedEl = replacement;
        resizeObserver?.disconnect();
        resizeObserver?.observe(replacement);
      } else {
        detachedSinceMs = null;
      }
      const rect = trackedEl.getBoundingClientRect();
      const disabled = isDisabledEl(trackedEl);
      // 동일 rect 재-set 방지 — 폴링이 매 tick 불필요한 리렌더를 만들지 않도록.
      // disabled를 key에 포함해, rect는 그대로인데 disabled만 토글된 경우에도 갱신되게 한다.
      const key = `${rect.top},${rect.left},${rect.width},${rect.height},${disabled}`;
      if (key === lastKey) return;
      lastKey = key;
      setResult({ rect, status: 'found', disabled });
    };

    const attach = (el: HTMLElement) => {
      if (cancelled) return;
      trackedEl = el;
      mutationObserver?.disconnect();
      if (timeoutId) clearTimeout(timeoutId);

      if (!scrolledRef.current) {
        scrolledRef.current = true;
        // 이미 뷰포트에 걸쳐 보이는 타깃은 재센터링하지 않는다 — 오프코스 리졸버
        // 점프가 자유 탐색 중인 사용자의 스크롤 위치를 당기지 않도록, 완전히
        // 밖일 때만 스크롤한다(안내 가시성은 유지). right/bottom은 스텁 rect에서
        // 누락될 수 있어 left/top+width/height로 계산한다.
        const r = el.getBoundingClientRect();
        const inViewport =
          r.top + r.height > 0 &&
          r.top < window.innerHeight &&
          r.left + r.width > 0 &&
          r.left < window.innerWidth;
        if (!inViewport) el.scrollIntoView({ block: 'center' });
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
      pollId = setInterval(updateRect, COACHMARK_POLL_MS);
    };

    const existing = queryTarget();
    if (existing) {
      attach(existing);
    } else {
      mutationObserver = new MutationObserver(() => {
        const found = queryTarget();
        if (found) attach(found);
      });
      // attributes도 관찰 — 기존 노드가 data-coachmark를 획득하며 앵커가 "되는"
      // 순수 속성 변이 등장(childList 변화 없음)을 놓치지 않도록.
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-coachmark'],
      });

      timeoutId = setTimeout(() => {
        if (cancelled || trackedEl) return;
        mutationObserver?.disconnect();
        setResult({ rect: null, status: 'notFound', disabled: false });
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
