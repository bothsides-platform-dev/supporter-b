'use client';

import { useSyncExternalStore } from 'react';
import { useThemeStore } from '@/lib/stores/theme';
import { applyThemeWithTransition } from '@/lib/theme/view-transition';

const noopSubscribe = () => () => {};

// SSR 과 첫 클라이언트 렌더에서 false, 하이드레이션 후 true. setState-in-effect
// 대신 useSyncExternalStore 를 쓰면 이 값이 React 렌더 캐스케이드에 안 들어간다.
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * 테마 토글의 상태·문구·전환을 한 곳에 모은다.
 *
 * 소비처가 둘인데 모양이 다르다 — 랜딩 푸터(`ThemeToggle`)는 정사각 아이콘
 * 버튼이고, 사이드바 푸터(`SidebarFooterControls`)는 문의하기와 같은 라벨 행이다.
 * 컴포넌트에 variant 를 다는 대신 로직만 공유해서 두 모양을 각자 두게 한다.
 */
export function useThemeToggle() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const hydrated = useHydrated();

  // 하이드레이션 전에는 항상 라이트 아이콘을 그려 서버·클라이언트 HTML 을 맞춘다.
  // zustand persist 가 localStorage 에서 동기로 복원하므로, 이 가드가 없으면
  // 클라이언트가 다른 아이콘을 그려 하이드레이션 미스매치가 난다.
  const isDark = hydrated && resolvedTheme === 'dark';

  // 화면에 보이는 라벨이자 접근 가능한 이름. 한 문자열에서 갈라져 나가므로
  // 둘이 어긋날 수 없다(WCAG 2.5.3 Label in Name).
  const label = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';

  /** `from` 의 아이콘 위치에서 원형 리빌을 시작하며 테마를 뒤집는다. */
  const toggleFrom = (from: HTMLElement) => {
    // 원점은 버튼이 아니라 **아이콘** 기준이다. 사이드바 푸터 행은 폭이 200px 라
    // 버튼 중심을 쓰면 정작 누른 아이콘에서 한참 떨어진 곳에서 퍼진다.
    // 정사각 아이콘 버튼에서는 둘의 중심이 같아 기존 동작 그대로다.
    const origin = from.querySelector('svg') ?? from;
    const rect = origin.getBoundingClientRect();

    applyThemeWithTransition(
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      () => {
        // 렌더 클로저가 아니라 스토어에서 현재 값을 읽는다 — 클로저를 쓰면
        // 연타할 때 클릭 직전 스냅샷을 보고 되돌아가는 버그가 난다.
        const current = useThemeStore.getState().resolvedTheme;
        setTheme(current === 'dark' ? 'light' : 'dark');
      },
    );
  };

  return { isDark, label, toggleFrom };
}
