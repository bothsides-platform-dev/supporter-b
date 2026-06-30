'use client';

import { memo } from 'react';
import { BidStepProposal } from './BidStepProposal';
import { useBidWizardContext } from './bid-wizard-context';

export const BidStepProposalContainer = memo(function BidStepProposalContainer() {
  const { proposal, memo: memoText, uploadProposal, clearProposal, setField } =
    useBidWizardContext();
  return (
    <BidStepProposal
      proposal={proposal}
      memo={memoText}
      onUpload={uploadProposal}
      onClear={clearProposal}
      onMemoChange={(v) => setField('memo', v)}
    />
  );
});
