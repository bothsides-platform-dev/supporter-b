'use client';

import { useEffect, type MouseEvent } from 'react';
// 막아야 할 키는 실제 토글 핸들러와 같은 출처에서 가져온다 — 따로 들고 있으면
// 단축키를 바꿨을 때 데모가 엉뚱한 키를 삼키고 진짜 키는 새어나간다.
import { SIDEBAR_TOGGLE_KEY } from '@/lib/shell/sidebar-cookie';

// 실제 앱 사이드바가 쓰는 전역 토글 단축키(⌘/Ctrl+B, components/ui/sidebar.tsx SidebarProvider)를
// 데모가 마운트된 동안 캡처 단계에서 가로챈다. 그대로 두면 랜딩 방문자가 무심코 눌렀을 때
// 데스크톱은 데모 사이드바가 접히고, 모바일은 off-canvas Sheet가 스케일된 데모 창 밖 body로
// 튀어나온다(클릭 트리거를 막는 것과 동일한 이유 — DemoAppShell/PgDemoAppShell onClickCapture 참고).

export function useBlockSidebarShortcut() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_TOGGLE_KEY && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // capture:true — SidebarProvider의 bubble 단계 window 리스너보다 먼저 실행되도록.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

const SIDEBAR_TRIGGER_SELECTOR = '[data-sidebar="trigger"]';

// DemoAppShell/PgDemoAppShell 의 onClickCapture 가 공유하는 클릭 차단 로직 — 같은 이유(위 훅 주석
// 참고)로 사이드바 토글 버튼 클릭을 캡처 단계에서 눌러 무시한다. true 를 반환하면 호출부는
// 이후의 다른 캡처 로직(앵커 인터셉트 등)을 건너뛰고 return 한다.
export function blockSidebarTriggerClick(e: MouseEvent): boolean {
  const target = e.target as HTMLElement;
  if (target.closest(SIDEBAR_TRIGGER_SELECTOR)) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  return false;
}
