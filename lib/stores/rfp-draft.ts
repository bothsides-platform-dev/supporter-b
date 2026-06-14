'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BizProfile } from '@/lib/types/biz-profile';
import type { PaymentMethod } from '@/lib/types/bid';

// 구매사 직접입력 커스텀 결제수단 (작성 단계 — id는 서버가 발급하므로 label만 보관).
export type DraftCustomPaymentMethod = { label: string };

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
  currentSettlementCycle: string;
  deliveryServicePeriod: string;
  currentSolution: string;
  currentSolutionDetail: string;
  memo: string;
  rfpFiles: RfpMockFile[];
  allowedPgWorkspaceIds: PgWorkspaceItem[];
  requiredPaymentMethods: PaymentMethod[];
  customPaymentMethods: DraftCustomPaymentMethod[];
  deadline: string;
  boardVisible: boolean;
  currentFeeVisibleToPg: boolean;
  contractType: 'new' | 'renewal' | null;
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
  currentSettlementCycle: '',
  deliveryServicePeriod: '',
  currentSolution: '',
  currentSolutionDetail: '',
  memo: '',
  rfpFiles: [] as RfpMockFile[],
  allowedPgWorkspaceIds: [] as PgWorkspaceItem[],
  requiredPaymentMethods: [] as PaymentMethod[],
  customPaymentMethods: [] as DraftCustomPaymentMethod[],
  deadline: '',
  boardVisible: true,
  currentFeeVisibleToPg: true,
  contractType: null as 'new' | 'renewal' | null,
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
      // 계약 유형 필드 추가에 따른 스키마 버전. migrate가 구버전 blob에 새 키를
      // 백필하므로 진행 중인 draft가 폐기되지 않는다.
      version: 6,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<RfpDraftStore>;
        if (version < 1) {
          return {
            ...state,
            requiredPaymentMethods: state.requiredPaymentMethods ?? [],
            customPaymentMethods: state.customPaymentMethods ?? [],
          };
        }
        if (version < 2) {
          return {
            ...state,
            currentSettlementCycle: state.currentSettlementCycle ?? '',
          };
        }
        if (version < 3) {
          return {
            ...state,
            deliveryServicePeriod: state.deliveryServicePeriod ?? '',
          };
        }
        if (version < 4) {
          return {
            ...state,
            boardVisible: state.boardVisible ?? true,
          };
        }
        if (version < 5) {
          return {
            ...state,
            contractType: state.contractType ?? null,
          };
        }
        if (version < 6) {
          return {
            ...state,
            currentFeeVisibleToPg: state.currentFeeVisibleToPg ?? true,
          };
        }
        return state;
      },
      // Only persist form data fields, not UI/method state
      partialize: (state) => ({
        title: state.title,
        websiteUrl: state.websiteUrl,
        mainProducts: state.mainProducts,
        annualPgVolume: state.annualPgVolume,
        currentFeeRate: state.currentFeeRate,
        currentSettlementLimit: state.currentSettlementLimit,
        currentGuaranteeInsurance: state.currentGuaranteeInsurance,
        currentSettlementCycle: state.currentSettlementCycle,
        deliveryServicePeriod: state.deliveryServicePeriod,
        currentSolution: state.currentSolution,
        currentSolutionDetail: state.currentSolutionDetail,
        memo: state.memo,
        rfpFiles: state.rfpFiles,
        allowedPgWorkspaceIds: state.allowedPgWorkspaceIds,
        requiredPaymentMethods: state.requiredPaymentMethods,
        customPaymentMethods: state.customPaymentMethods,
        deadline: state.deadline,
        boardVisible: state.boardVisible,
        currentFeeVisibleToPg: state.currentFeeVisibleToPg,
        contractType: state.contractType,
      }),
    },
  ),
);
