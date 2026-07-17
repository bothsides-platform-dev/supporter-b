'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getContractService } from '@/lib/server/services/contract';
import { getRequestMeta } from './_request-meta';
import type { ContractActionResult } from './_shared';

const Input = z
  .object({
    docId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type DeclineContractInput = z.input<typeof Input>;
export type DeclineContractResult = ContractActionResult;

/**
 * buyer 서명자(또는 buyer admin)가 발송된 계약서를 반려. 세션(requireBuyerActor) +
 * 입력 검증 후 meta 캡처해 ContractService.decline 위임.
 */
export async function declineContractAction(input: DeclineContractInput): Promise<DeclineContractResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const meta = await getRequestMeta();
  const service = await getContractService();
  return service.decline(
    parsed.data.docId,
    parsed.data.reason,
    { userId: actor.userId, workspaceId: actor.workspaceId },
    meta,
  );
}
