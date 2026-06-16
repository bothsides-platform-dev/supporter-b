'use client';

import { memo } from 'react';
import { BidStepReview } from './BidStepReview';
import { useBidWizardContext } from './bid-wizard-context';

export const BidStepReviewContainer = memo(function BidStepReviewContainer() {
  const {
    settleCycle,
    settleLimit,
    guaranteeInsurance,
    feeInputMethods,
    customPaymentMethods,
    fees,
    canSubmit,
    pending,
    submitError,
    back,
    handleSubmit,
    onSaveTemplate,
  } = useBidWizardContext();
  return (
    <BidStepReview
      settleCycle={settleCycle}
      settleLimit={settleLimit}
      guaranteeInsurance={guaranteeInsurance}
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      canSubmit={canSubmit}
      pending={pending}
      submitError={submitError}
      onBack={back}
      onSubmit={handleSubmit}
      onSaveTemplate={onSaveTemplate}
    />
  );
});
