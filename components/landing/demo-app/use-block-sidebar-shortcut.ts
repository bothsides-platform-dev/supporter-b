'use client';

import { useEffect } from 'react';

// 실제 앱 사이드바가 쓰는 전역 토글 단축키(⌘/Ctrl+B, components/ui/sidebar.tsx SidebarProvider)를
// 데모가 마운트된 동안 캡처 단계에서 가로챈다. 그대로 두면 랜딩 방문자가 무심코 눌렀을 때
// 데스크톱은 데모 사이드바가 접히고, 모바일은 off-canvas Sheet가 스케일된 데모 창 밖 body로
// 튀어나온다(클릭 트리거를 막는 것과 동일한 이유 — DemoAppShell/PgDemoAppShell onClickCapture 참고).
const SIDEBAR_TOGGLE_KEY = 'b';

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
