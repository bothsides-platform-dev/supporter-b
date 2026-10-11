'use server';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getAttachmentRepo, getPgMatchingRepo, getRfpRepo } from '@/lib/server/repositories/factory';

/**
 * Return unclaimed IDs, plus ready IDs belonging to this workspace's already
 * committed matching request. Missing IDs are reuploaded from local originals.
 */
export async function verifyDraftFilesAction(ids: string[], requestKey?: string): Promise<{ validIds: string[] }> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return { validIds: [] };
  if (ids.length === 0) return { validIds: [] };

  const repo = await getAttachmentRepo();
  const rows = await repo.findUnclaimedByIds(ids);
  const validIds = rows.map((r) => r.id);
  // A committed submission may have lost its response. Keep its original IDs
  // so the service can compare the unchanged payload and return the same result.
  if (requestKey) {
    const existing = await (await getPgMatchingRepo()).findByKey(actor.workspaceId, requestKey);
    const rfp = existing && await (await getRfpRepo()).findIdAndOwnerByCode(existing.code);
    if (rfp?.buyerWsId === actor.workspaceId) {
      const requested = new Set(ids);
      const claimed = await repo.findByRfp(rfp.id);
      validIds.push(...claimed.filter(file => requested.has(file.id)).map(file => file.id));
    }
  }
  return { validIds };
}
