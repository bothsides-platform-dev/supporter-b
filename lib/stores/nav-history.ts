'use client';

import { create } from 'zustand';

/**
 * In-app navigation history — an entries/index stack the shell tracks itself so
 * the header `‹ ›` buttons can stay inside our service and disable when there's
 * nowhere to go. The browser History API can't tell us whether the previous
 * entry is ours or whether a forward entry exists, so we mirror it here.
 *
 * Pure store: it never touches the router. `NavigationHistoryTracker` feeds it
 * `sync(url)` on every route change; the Breadcrumb calls `markBack/markForward`
 * (its own button intent) right before `router.back()/forward()`.
 */
type NavHistoryStore = {
  entries: string[];
  index: number;
  /** Direction hint set by our own buttons; disambiguates duplicate neighbors. */
  pendingDir: -1 | 0 | 1;
  sync: (url: string) => void;
  markBack: () => void;
  markForward: () => void;
  reset: () => void;
};

export const useNavHistoryStore = create<NavHistoryStore>((set) => ({
  entries: [],
  index: 0,
  pendingDir: 0,
  sync: (url) =>
    set((s) => {
      if (s.entries.length === 0) {
        return { entries: [url], index: 0, pendingDir: 0 };
      }
      if (s.pendingDir === -1) {
        return { index: Math.max(0, s.index - 1), pendingDir: 0 };
      }
      if (s.pendingDir === 1) {
        return { index: Math.min(s.entries.length - 1, s.index + 1), pendingDir: 0 };
      }
      if (url === s.entries[s.index]) return s;
      if (url === s.entries[s.index - 1]) return { index: s.index - 1 };
      if (url === s.entries[s.index + 1]) return { index: s.index + 1 };
      const entries = [...s.entries.slice(0, s.index + 1), url];
      return { entries, index: entries.length - 1 };
    }),
  markBack: () => set((s) => (s.index > 0 ? { pendingDir: -1 } : s)),
  markForward: () =>
    set((s) => (s.index < s.entries.length - 1 ? { pendingDir: 1 } : s)),
  reset: () => set({ entries: [], index: 0, pendingDir: 0 }),
}));
