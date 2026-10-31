import type { BidDraft } from '@/lib/quote/bid-draft';
import type { RFP } from '@/lib/types/rfp';
import { PAYMENT_METHODS, type Bid } from '@/lib/types/bid';
import { BidStepReview } from './BidStepReview';

/** Both copies use the same human-readable review as the final submission. */
export function DraftReview({
  content,
  rfp,
  buyerName,
  baseBid,
}: {
  content: BidDraft;
  rfp: RFP;
  buyerName: string;
  baseBid?: Bid;
}) {
  return (
    <BidStepReview
      settleCycle={`${content.cycleUnit}+${content.cycleNum}`}
      settleLimit={content.settleLimit}
      signupFee={content.signupFee}
      guaranteeInsurance={content.guaranteeInsurance}
      fees={content.fees}
      conditionStates={content.conditionStates}
      memo={content.memo}
      proposalChoice={content.proposalChoice}
      proposal={content.uploadedProposal ?? null}
      feeInputMethods={
        rfp.requiredPaymentMethods.length ? rfp.requiredPaymentMethods : [...PAYMENT_METHODS]
      }
      customPaymentMethods={rfp.customPaymentMethods}
      buyerName={buyerName}
      rfpCode={rfp.code}
      round={baseBid ? baseBid.round + 1 : 1}
      previousProposal={baseBid?.proposalPdfs[0]}
      submitError={null}
    />
  );
}
