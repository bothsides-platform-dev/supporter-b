import type { AgreementDraftLookupRepo } from '@/lib/server/repositories/types';
import { LONG_TERM_AGREEMENTS_ENABLED } from '@/lib/features/long-term-agreements';
import type { SigningContract } from '@/lib/types/signing';

export async function requiresCommonAgreement(contract: SigningContract, agreementRepo: AgreementDraftLookupRepo): Promise<boolean> {
  if (!LONG_TERM_AGREEMENTS_ENABLED) return false;
  return !contract.providerRef || !!(await agreementRepo.findDraft(contract.id));
}
