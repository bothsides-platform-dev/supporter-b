// Server-only creation path; never imported by client components.
import { lookupNewBusiness, type NewBusinessApproval, type BuyerBusinessResult } from './new-business';
export type BuyerAutoApproval = NewBusinessApproval;

/** Called only by creation services, after the action's server-side NTS lookup. */
export async function resolveBuyerBusiness(input: {
  type: 'buyer' | 'pg'; bizVerified?: boolean; bizProfile?: { bizNo: string; status?: string };
}): Promise<BuyerBusinessResult> {
  if (input.type !== 'buyer' || input.bizVerified !== true || input.bizProfile?.status !== 'active') return {};
  return lookupNewBusiness(input.bizProfile.bizNo.replace(/[-\s]/g, ''));
}
