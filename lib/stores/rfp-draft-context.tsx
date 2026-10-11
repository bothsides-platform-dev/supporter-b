'use client';
import { createContext, useContext } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { useRfpDraftStore, type RfpDraftStore } from './rfp-draft';
const Context = createContext<StoreApi<RfpDraftStore> | null>(null);
export const RfpDraftProvider = Context.Provider;
export function useRfpDraftApi() {
  return useContext(Context) ?? useRfpDraftStore;
}
export function useRfpDraft<T = RfpDraftStore>(
  selector: (state: RfpDraftStore) => T = (state) => state as T,
) {
  return useStore(useRfpDraftApi(), selector);
}
