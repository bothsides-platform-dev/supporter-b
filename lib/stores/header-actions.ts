'use client';

import { create } from 'zustand';

export type RefreshSlot = {
  onRefresh: () => void;
  lastRefreshedAt: Date;
  isRefreshing: boolean;
};

type HeaderActionsStore = {
  refreshSlot: RefreshSlot | null;
  setRefreshAction: (slot: RefreshSlot) => void;
  clearRefreshAction: () => void;
};

export const useHeaderActionsStore = create<HeaderActionsStore>((set) => ({
  refreshSlot: null,
  setRefreshAction: (slot) => set({ refreshSlot: slot }),
  clearRefreshAction: () => set({ refreshSlot: null }),
}));
