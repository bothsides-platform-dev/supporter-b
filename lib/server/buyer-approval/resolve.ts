// Server-only creation path; never imported by client components.
import { lookupBonaPayGrade, type GradeLookup } from './bona-pay';

export type BuyerAutoApproval = GradeLookup & { outcome: 'sole_confirmed'; effectiveDate: string };

/** Called only by creation services, after the action's server-side NTS lookup. */
export async function resolveBuyerAutoApproval(input: {
  type: 'buyer' | 'pg';
  bizVerified?: boolean;
  bizProfile?: { bizNo: string; status?: string };
}): Promise<BuyerAutoApproval | undefined> {
  if (process.env.BUYER_SOLE_AUTO_APPROVAL_ENABLED !== 'true'
    || input.type !== 'buyer' || input.bizVerified !== true
    || input.bizProfile?.status !== 'active') return undefined;
  const result = await lookupBonaPayGrade(input.bizProfile.bizNo.replace(/[-\s]/g, ''));
  if (result.outcome !== 'sole_confirmed' || !result.effectiveDate) return undefined;
  return { ...result, outcome: 'sole_confirmed', effectiveDate: result.effectiveDate };
}
