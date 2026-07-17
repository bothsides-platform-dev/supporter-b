'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractService } from '@/lib/server/services/contract';
import { getRequestMeta } from './_request-meta';
import type { ContractActionResult } from './_shared';

const Input = z.object({ docId: z.string().uuid() }).strict();

export type CancelContractInput = z.input<typeof Input>;
export type CancelContractResult = ContractActionResult;

/**
 * PG(발송자 또는 PG admin)가 발송된 계약서를 회수. 세션(requirePgActor) + 입력
 * 검증 후 meta 캡처해 ContractService.cancel 위임.
 */
export async function cancelContractAction(input: CancelContractInput): Promise<CancelContractResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const meta = await getRequestMeta();
  const service = await getContractService();
  return service.cancel(parsed.data.docId, { userId: actor.userId, workspaceId: actor.workspaceId }, meta);
}
