import { LONG_TERM_AGREEMENTS_ENABLED } from '@/lib/features/long-term-agreements';
import { getAgreementRepo } from '@/lib/server/repositories/factory';
import type { SigningContract } from '@/lib/types/signing';

export async function requiresCommonAgreement(contract: SigningContract): Promise<boolean> {
  if (!LONG_TERM_AGREEMENTS_ENABLED) return false;
  return !contract.providerRef || !!(await (await getAgreementRepo()).findDraft(contract.id));
}
