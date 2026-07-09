'use client';

// 튜토리얼 동안 키보드 입력을 전면 차단하는 락 — 튜토리얼은 "클릭만으로 진행"이
// 계약이라, 프리필된 폼 값을 사용자가 지우거나 덮어쓸 수 없어야 한다.
// Escape만 통과시킨다(CoachmarkTour의 window 스킵 리스너가 받아야 함).
import { useEffect } from 'react';

export function useTutorialKeyboardLock() {
  useEffect(() => {
    const blockKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
    };
    // beforeinput까지 막아야 마우스 컨텍스트메뉴 붙여넣기·IME 조합 입력도 차단된다.
    const blockBeforeInput = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('keydown', blockKeydown, { capture: true });
    document.addEventListener('beforeinput', blockBeforeInput, { capture: true });
    return () => {
      document.removeEventListener('keydown', blockKeydown, { capture: true });
      document.removeEventListener('beforeinput', blockBeforeInput, { capture: true });
    };
  }, []);
}
