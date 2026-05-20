'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BizProfile } from '@/lib/types/biz-profile';

// `id` is the attachment row id returned by POST /api/files/upload
// (Step 11). Pre-Step 11 the dropzone carried only name/size in
// memory; the file now lives in the storage backend + the `attachments`
// row at upload time (`ownerId='__draft__'`), and `createRfpAction`
// patches the row's ownerId to the freshly minted RFP id at form
// submit.
// Name kept for blast-radius reasons (Step 13 will sweep `Mock` naming).
export type RfpMockFile = { id: string; name: string; size: number };

export type PgWorkspaceItem = { id: string; displayName: string };

type RfpDraftStore = {
  step: number;
  bizProfile: BizProfile | null;
  title: string;
  memo: string;
  rfpFiles: RfpMockFile[];
  allowedPgWorkspaceIds: PgWorkspaceItem[];
  deadline: string;
  setStep: (step: number) => void;
  setBizProfile: (biz: BizProfile | null) => void;
  setField: <K extends keyof RfpDraftStore>(key: K, value: RfpDraftStore[K]) => void;
  reset: () => void;
};

const defaultState = {
  step: 0,
  bizProfile: null,
  title: '',
  memo: '',
  rfpFiles: [] as RfpMockFile[],
  allowedPgWorkspaceIds: [] as PgWorkspaceItem[],
  deadline: '',
};

export const useRfpDraftStore = create<RfpDraftStore>()(
  persist(
    (set) => ({
      ...defaultState,
      setStep: (step) => set({ step }),
      setBizProfile: (bizProfile) => set({ bizProfile }),
      setField: (key, value) => set({ [key]: value } as Partial<RfpDraftStore>),
      reset: () => set(defaultState),
    }),
    {
      name: 'supporter-b-rfp-draft',
      storage: createJSONStorage(() => localStorage),
      // Only persist form data fields, not UI/method state
      partialize: (state) => ({
        title: state.title,
        memo: state.memo,
        rfpFiles: state.rfpFiles,
        allowedPgWorkspaceIds: state.allowedPgWorkspaceIds,
        deadline: state.deadline,
      }),
    },
  ),
);
