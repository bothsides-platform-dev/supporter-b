'use client';

import { memo } from 'react';
import { BidStepFees } from './BidStepFees';
import { useBidWizardContext } from './bid-wizard-context';

export const BidStepFeesContainer = memo(function BidStepFeesContainer() {
  const { feeInputMethods, customPaymentMethods, fees, setFee, back, advance } =
    useBidWizardContext();
  return (
    <BidStepFees
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      onFee={setFee}
      onBack={back}
      onNext={advance}
    />
  );
});
