'use client';

import { useSyncExternalStore } from 'react';
import { useThemeStore } from '@/lib/stores/theme';
import { applyThemeWithTransition } from '@/lib/theme/view-transition';
import { IconButton } from '@/components/primitives/IconButton';
import { SunIcon, MoonIcon } from '@/components/icons';

const noopSubscribe = () => () => {};

// Returns false during SSR and the initial client render, then true once
// hydrated. Using useSyncExternalStore (instead of a setState-in-effect mount
// flag) keeps the value out of React's render cascade.
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const hydrated = useHydrated();

  // Before hydration: always render light-mode icon so server and client HTML
  // match. Zustand persist rehydrates from localStorage synchronously, which
  // would produce a different icon on the client → hydration mismatch without
  // this guard.
  const isDark = hydrated && resolvedTheme === 'dark';

  return (
    <IconButton
      label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      size="md"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        applyThemeWithTransition(
          { x: r.left + r.width / 2, y: r.top + r.height / 2 },
          () => {
            // Read current state from the store, not from the render closure,
            // to avoid a stale-closure double-click bug where isDark reflects
            // the pre-click render snapshot rather than the live store value.
            const current = useThemeStore.getState().resolvedTheme;
            setTheme(current === 'dark' ? 'light' : 'dark');
          },
        );
      }}
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </IconButton>
  );
}
