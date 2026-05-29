'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_ITEMS = 100;

type RecentlyViewedInboxStore = {
  rfpIds: string[];
  markViewed: (rfpId: string) => void;
  isViewed: (rfpId: string) => boolean;
};

export const useRecentlyViewedInbox = create<RecentlyViewedInboxStore>()(
  persist(
    (set, get) => ({
      rfpIds: [],
      markViewed: (rfpId) =>
        set((s) => {
          const filtered = s.rfpIds.filter((id) => id !== rfpId);
          return { rfpIds: [rfpId, ...filtered].slice(0, MAX_ITEMS) };
        }),
      isViewed: (rfpId) => get().rfpIds.includes(rfpId),
    }),
    {
      name: 'bidit-recently-viewed-inbox',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ rfpIds: state.rfpIds }),
    },
  ),
);
