import * as React from 'react';

/**
 * min-width 브레이크포인트 훅 팩토리 — useIsLgUp/useIsXlUp 의 단일 출처.
 * subscribe/getSnapshot 을 모듈 생성 시점에 고정해 useSyncExternalStore 재구독을 막는다.
 */
export function createMinWidthHook(breakpoint: number): () => boolean {
  function subscribe(callback: () => void): () => void {
    // jsdom 등 matchMedia 미지원 환경에선 구독을 생략(스냅샷은 innerWidth 로 평가).
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }

  function getSnapshot(): boolean {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= breakpoint;
  }

  function getServerSnapshot(): boolean {
    // 데스크톱 우선 — SSR·하이드레이션 첫 렌더는 min-width 충족으로 맞춰 미스매치/깜빡임을 줄인다.
    return true;
  }

  return function useMinWidth(): boolean {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  };
}
