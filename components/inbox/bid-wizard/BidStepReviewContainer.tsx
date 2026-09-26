'use client';

import { memo } from 'react';
import { BidStepReview } from './BidStepReview';
import { useBidWizardContext } from './bid-wizard-context';

export const BidStepReviewContainer = memo(function BidStepReviewContainer() {
  const {
    settleCycle,
    settleLimit,
    guaranteeInsurance,
    signupFee,
    feeInputMethods,
    customPaymentMethods,
    fees,
    submitError,
    proposalChoice,
    previousProposal,
    proposal,
    onSaveTemplate,
  } = useBidWizardContext();
  return (
    <BidStepReview
      settleCycle={settleCycle}
      settleLimit={settleLimit}
      guaranteeInsurance={guaranteeInsurance}
      signupFee={signupFee}
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      submitError={submitError}
      proposalChoice={proposalChoice}
      previousProposal={previousProposal}
      proposal={proposal}
      onSaveTemplate={onSaveTemplate}
    />
  );
});
