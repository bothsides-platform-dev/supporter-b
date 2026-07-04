'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { BidDraft } from '../useBidDraft';
import type { CustomPaymentMethod, PaymentMethod } from '@/lib/types/bid';
import type { SetBidField } from './types';
import type { ProposalState } from './BidStepProposal';

/**
 * BidWizard 의 4단계가 공유하는 폼 상태 + 액션을 담는 스코프 컨텍스트.
 *
 * 목적: 단계마다 8개+ prop 을 prop-drilling 하지 않고, 각 단계 컨테이너가
 * 필요한 값만 컨텍스트에서 읽도록 한다. 컨텍스트 value 는 BidWizard 가
 * useMemo 로 안정화해 무관한 단계의 불필요한 리렌더를 줄인다.
 *
 * 순수 presentational 단계 컴포넌트(BidStep*)의 prop 시그니처는 바꾸지 않는다 —
 * 컨테이너가 컨텍스트→prop 으로 변환해 기존 단계를 렌더한다.
 */
export type BidWizardContextValue = {
  // BidDraft 폼 필드
  cycleUnit: BidDraft['cycleUnit'];
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  fees: Record<string, string>;
  memo: string;
  // 파생값
  settleCycle: string;
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  proposal: ProposalState;
  pending: boolean;
  submitError: string | null;
  /** step1(정산주기) 제출 시도 후 → 필수 필드 빨강 escalate. */
  settlementAttempted: boolean;
  /** step2(수수료) 제출 시도 후 → 0칸이면 단계 메시지 표시. */
  feesAttempted: boolean;
  // 액션 (BidWizard 가 useCallback/stable 참조로 제공)
  setField: SetBidField;
  setFee: (key: string, value: string) => void;
  uploadProposal: (file: File) => void;
  clearProposal: () => void;
  advance: () => void;
  back: () => void;
  handleSubmit: () => void;
  onSaveTemplate: (name: string) => Promise<{ ok: boolean; error?: string }>;
};

const BidWizardContext = createContext<BidWizardContextValue | null>(null);

export function BidWizardProvider({
  value,
  children,
}: {
  value: BidWizardContextValue;
  children: ReactNode;
}) {
  return <BidWizardContext.Provider value={value}>{children}</BidWizardContext.Provider>;
}

export function useBidWizardContext(): BidWizardContextValue {
  const ctx = useContext(BidWizardContext);
  if (ctx === null) {
    throw new Error('useBidWizardContext must be used within a BidWizardProvider');
  }
  return ctx;
}
