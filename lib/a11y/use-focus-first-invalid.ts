'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 막힌 제출 뒤 첫 번째 문제 필드로 포커스를 옮긴다.
 *
 * 검증 결과(`aria-invalid="true"`)가 렌더된 **다음에** 찾아야 하므로 요청 횟수를
 * 상태로 두고 effect 에서 처리한다 — 같은 필드에서 연달아 막혀도 매번 다시 옮긴다
 * (`RfpQuestionFlow` 의 errorFocusRequest 와 같은 방식). 대상은 컨테이너 안의
 * 문서 순서상 첫 요소라 화면 위에서 아래 순서와 같다.
 */
export function useFocusFirstInvalid<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (!request) return;
    const target = containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!target) return;
    // 화면 가장자리에 붙지 않게 가운데로 옮긴다. scrollIntoView 가 없는 환경(jsdom)은
    // 브라우저 기본 포커스 스크롤에 맡긴다.
    if (typeof target.scrollIntoView === 'function') {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center' });
    } else {
      target.focus();
    }
  }, [request]);

  const requestFocus = useCallback(() => setRequest((n) => n + 1), []);
  return { containerRef, requestFocus };
}
