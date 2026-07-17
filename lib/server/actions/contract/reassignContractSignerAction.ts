'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getContractService } from '@/lib/server/services/contract';
import { getRequestMeta } from './_request-meta';
import type { ContractActionResult } from './_shared';

const Input = z
  .object({
    docId: z.string().uuid(),
    newUserId: z.string().uuid(),
  })
  .strict();

export type ReassignContractSignerInput = z.input<typeof Input>;
export type ReassignContractSignerResult = ContractActionResult;

/**
 * buyer admin이 아직 서명 전인 구매사측 서명자를 다른 승인된 멤버로 재지정.
 * 세션(requireBuyerActor) + 입력 검증 후 meta 캡처해 ContractService.reassignBuyerSigner 위임.
 */
export async function reassignContractSignerAction(
  input: ReassignContractSignerInput,
): Promise<ReassignContractSignerResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const meta = await getRequestMeta();
  const service = await getContractService();
  return service.reassignBuyerSigner(
    parsed.data.docId,
    parsed.data.newUserId,
    { userId: actor.userId, workspaceId: actor.workspaceId },
    meta,
  );
}
