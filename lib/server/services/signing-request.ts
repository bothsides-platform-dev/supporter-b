import { instantAward } from '../repositories/drizzle/instant-quotes';
export { instantAward } from '../repositories/drizzle/instant-quotes';
import type { RfpRepo, Tx } from '@/lib/server/repositories/types';
import type { RFP } from '@/lib/types/rfp';
import type { SigningContract } from '@/lib/types/signing';

export type SigningRequest = Pick<
  RFP,
  'id' | 'code' | 'title' | 'buyerWsId' | 'createdBy'
> & { instantAttemptId?: string };
export async function signingRequest(
  repo: RfpRepo,
  contract: SigningContract,
  tx?: Tx,
): Promise<SigningRequest | undefined> {
  if (contract.instantAttemptId)
    return (await instantAward(contract.instantAttemptId, tx))?.request;
  if (contract.rfpId) return repo.findById(contract.rfpId, tx);
}
