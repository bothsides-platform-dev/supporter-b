'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

type ThemeState = {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: Theme) => void;
};

function applyTheme(resolved: 'light' | 'dark') {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function resolveSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let mediaQueryCleanup: (() => void) | null = null;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: (t: Theme) => {
        if (mediaQueryCleanup) {
          mediaQueryCleanup();
          mediaQueryCleanup = null;
        }

        if (t === 'system') {
          const resolved = resolveSystemTheme();
          applyTheme(resolved);
          set({ theme: t, resolvedTheme: resolved });

          const mq = window.matchMedia('(prefers-color-scheme: dark)');
          const handler = (e: MediaQueryListEvent) => {
            const next = e.matches ? 'dark' : 'light';
            applyTheme(next);
            set({ resolvedTheme: next });
          };
          mq.addEventListener('change', handler);
          mediaQueryCleanup = () => mq.removeEventListener('change', handler);
        } else {
          applyTheme(t);
          set({ theme: t, resolvedTheme: t });
        }
      },
    }),
    {
      name: 'support-b-theme',
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== 'undefined') state.setTheme(state.theme);
      },
    },
  ),
);
