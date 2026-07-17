'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractService } from '@/lib/server/services/contract';
import { getRequestMeta } from './_request-meta';
import type { ContractActionResult } from './_shared';

const PartyInfoInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    repName: z.string().trim().min(1).max(40),
    bizNo: z.string().trim().nullable(),
  })
  .strict();

const Input = z
  .object({
    rfpCode: z.string().regex(/^P-\d{4}-\d{4}$/),
    templateId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    parties: z
      .object({
        _v: z.literal(1),
        buyer: PartyInfoInput,
        pg: PartyInfoInput,
      })
      .strict(),
    pgSignerUserId: z.string().uuid(),
    expiresInDays: z.number().int().min(1).max(90).default(14),
  })
  .strict();

export type SendContractInput = z.input<typeof Input>;
export type SendContractResult = ContractActionResult<{ docId: string; code: string }>;

/**
 * 선정된 PG가 계약서 템플릿으로 전자계약서를 발송. 세션(requirePgActor) + 입력
 * 검증 후 meta(ip/user-agent) 캡처해 ContractService.send 로 위임.
 */
export async function sendContractAction(input: SendContractInput): Promise<SendContractResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const meta = await getRequestMeta();
  const service = await getContractService();
  return service.send(
    {
      rfpCode: parsed.data.rfpCode,
      templateId: parsed.data.templateId,
      title: parsed.data.title,
      parties: parsed.data.parties,
      pgSignerUserId: parsed.data.pgSignerUserId,
      expiresInDays: parsed.data.expiresInDays,
    },
    { userId: actor.userId, workspaceId: actor.workspaceId },
    meta,
  );
}
