'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type SidebarSectionId = 'rfp' | 'inbox' | 'settings';

type SidebarSectionsStore = {
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
  isCollapsed: (id: string) => boolean;
};

export const useSidebarSectionsStore = create<SidebarSectionsStore>()(
  persist(
    (set, get) => ({
      collapsed: {},
      toggle: (id: string) =>
        set((s) => ({
          collapsed: { ...s.collapsed, [id]: !s.collapsed[id] },
        })),
      isCollapsed: (id: string) => get().collapsed[id] ?? false,
    }),
    {
      name: 'bidit-sidebar-sections',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ collapsed: state.collapsed }),
    },
  ),
);
