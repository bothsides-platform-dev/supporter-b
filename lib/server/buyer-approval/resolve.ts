// Server-only creation path; never imported by client components.
import { lookupNewBusiness, type NewBusinessApproval } from './new-business';
import { lookupBonaPayGrade, type GradeLookup } from './bona-pay';

export type BuyerAutoApproval = (GradeLookup & { outcome: 'sole_confirmed'; effectiveDate: string }) | NewBusinessApproval;

/** Called only by creation services, after the action's server-side NTS lookup. */
export async function resolveBuyerAutoApproval(input: {
  type: 'buyer' | 'pg';
  bizVerified?: boolean;
  bizProfile?: { bizNo: string; status?: string };
}): Promise<BuyerAutoApproval | undefined> {
  if (input.type !== 'buyer' || input.bizVerified !== true
    || input.bizProfile?.status !== 'active') return undefined;
  const result = await lookupBonaPayGrade(input.bizProfile.bizNo.replace(/[-\s]/g, ''));
  if (result.outcome !== 'sole_confirmed' || !result.effectiveDate) return lookupNewBusiness(result.bizNo);
  return { ...result, outcome: 'sole_confirmed', effectiveDate: result.effectiveDate };
}

/** Merchant grade confirmed by a provider and our opening-age exception remain distinct. */
export function approvalGradeSource(approval: BuyerAutoApproval): 'api_confirmed' | 'new_business_exception' {
  return approval.outcome === 'new_business_confirmed' ? 'new_business_exception' : 'api_confirmed';
}
