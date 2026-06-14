import * as React from 'react';

const LG_BREAKPOINT = 1024;

function subscribe(callback: () => void): () => void {
  // jsdom 등 matchMedia 미지원 환경에선 구독을 생략(스냅샷은 innerWidth 로 평가).
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= LG_BREAKPOINT;
}

function getServerSnapshot(): boolean {
  // 데스크톱 우선 — SSR·하이드레이션 첫 렌더는 lg(채팅 aside)로 맞춰 미스매치/깜빡임을 줄인다.
  return true;
}

/** 뷰포트 폭이 lg(1024px) 이상인지. 딜룸이 채팅을 aside(lg+) vs 하단 시트(<lg)로 가를 때 사용. */
export function useIsLgUp(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
