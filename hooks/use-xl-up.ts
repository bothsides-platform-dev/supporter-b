import * as React from 'react';

const XL_BREAKPOINT = 1280;

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= XL_BREAKPOINT;
}

function getServerSnapshot(): boolean {
  return true;
}

/** 뷰포트 폭이 xl(1280px) 이상인지. 메시지 페이지 3-컬럼 전환 기준. */
export function useIsXlUp(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
