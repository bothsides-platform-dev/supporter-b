'use client';

import { memo } from 'react';
import type { MerchantTier } from '@/lib/types/bid';
import { BidStepFees } from './BidStepFees';
import { useBidWizardContext } from './bid-wizard-context';

export const BidStepFeesContainer = memo(function BidStepFeesContainer({ buyerTier }: { buyerTier?: MerchantTier }) {
  const { feeInputMethods, customPaymentMethods, fees, setFee, feesAttempted } =
    useBidWizardContext();
  return (
    <BidStepFees
      buyerTier={buyerTier}
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      onFee={setFee}
      attempted={feesAttempted}
    />
  );
});
