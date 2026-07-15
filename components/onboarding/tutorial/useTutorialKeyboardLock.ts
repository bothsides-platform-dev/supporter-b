'use client';

// 튜토리얼 동안 프리필된 폼 값을 키보드로 지우거나 덮어쓸 수 없게 잠그는 락 —
// 튜토리얼은 "클릭만으로 진행"이 계약이다. 단 차단은 편집 요소에 포커스가 있을
// 때의 편집 키에만 적용한다: Tab/Escape/modifier 체인과 버튼 위 Enter/Space는
// 통과시켜 키보드 사용자도 포커스 이동·다이얼로그/팝오버 닫기·CTA 조작을 할 수
// 있다(접근성). Esc는 코치마크에 아무 동작도 하지 않는다(스킵=버튼 클릭 전용 —
// 오발 Esc가 튜토리얼 완료로 이어지는 것을 막는 계약). 값 변경의 최종 방어선은
// beforeinput 전역 차단이다.
import { useEffect } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target.isContentEditable;
}

export function useTutorialKeyboardLock() {
  useEffect(() => {
    const blockKeydown = (event: KeyboardEvent) => {
      if (!isEditableTarget(event.target)) return;
      if (event.key === 'Escape' || event.key === 'Tab') return;
      // Cmd/Ctrl 체인(복사·새로고침 등 브라우저 단축키)은 값을 타이핑하지 않는다.
      if (event.metaKey || event.ctrlKey) return;
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
