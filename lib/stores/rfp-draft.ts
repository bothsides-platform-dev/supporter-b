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
  bizProfile: BizProfile | null;
  title: string;
  websiteUrl: string;
  mainProducts: string;
  annualPgVolume: string;
  currentFeeRate: string;
  currentSettlementLimit: string;
  currentGuaranteeInsurance: string;
  currentSolution: string;
  currentSolutionDetail: string;
  memo: string;
  rfpFiles: RfpMockFile[];
  allowedPgWorkspaceIds: PgWorkspaceItem[];
  deadline: string;
  setBizProfile: (biz: BizProfile | null) => void;
  setField: <K extends keyof RfpDraftStore>(key: K, value: RfpDraftStore[K]) => void;
  reset: () => void;
};

const defaultState = {
  bizProfile: null,
  title: '',
  websiteUrl: '',
  mainProducts: '',
  annualPgVolume: '',
  currentFeeRate: '',
  currentSettlementLimit: '',
  currentGuaranteeInsurance: '',
  currentSolution: '',
  currentSolutionDetail: '',
  memo: '',
  rfpFiles: [] as RfpMockFile[],
  allowedPgWorkspaceIds: [] as PgWorkspaceItem[],
  deadline: '',
};

export const useRfpDraftStore = create<RfpDraftStore>()(
  persist(
    (set) => ({
      ...defaultState,
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
        websiteUrl: state.websiteUrl,
        mainProducts: state.mainProducts,
        annualPgVolume: state.annualPgVolume,
        currentFeeRate: state.currentFeeRate,
        currentSettlementLimit: state.currentSettlementLimit,
        currentGuaranteeInsurance: state.currentGuaranteeInsurance,
        currentSolution: state.currentSolution,
        currentSolutionDetail: state.currentSolutionDetail,
        memo: state.memo,
        rfpFiles: state.rfpFiles,
        allowedPgWorkspaceIds: state.allowedPgWorkspaceIds,
        deadline: state.deadline,
      }),
    },
  ),
);
