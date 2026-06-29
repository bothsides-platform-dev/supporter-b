'use client';

import { memo } from 'react';
import { BidStepSettlement } from './BidStepSettlement';
import { useBidWizardContext } from './bid-wizard-context';

/**
 * 컨텍스트→prop 어댑터. 순수 BidStepSettlement 의 prop 시그니처는 유지하고,
 * BidWizard 의 prop-drilling 만 제거한다.
 */
export const BidStepSettlementContainer = memo(function BidStepSettlementContainer() {
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, setField, settlementAttempted } =
    useBidWizardContext();
  return (
    <BidStepSettlement
      cycleUnit={cycleUnit}
      cycleNum={cycleNum}
      settleLimit={settleLimit}
      guaranteeInsurance={guaranteeInsurance}
      onField={setField}
      attempted={settlementAttempted}
    />
  );
});
