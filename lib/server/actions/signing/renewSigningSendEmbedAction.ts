'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({ rfpCode: z.string().min(1), claimedAt: z.string().datetime({ offset: true }) })
  .strict();

/**
 * 딜룸 계약 탭 — 발송 임베드가 열려 있는 동안 리스를 연장하는 하트비트.
 *
 * 성공하면 **새 토큰**(`claimedAt`)을 돌려주며, 화면은 그 값을 다음 연장·반납에 쓴다.
 * 실패는 리스를 다른 담당자가 가져갔다는 뜻이므로 화면이 하트비트를 멈추고 패널을
 * 닫아야 한다 — 그대로 발송하면 계약이 두 건 살아난다.
 */
export async function renewSigningSendEmbedAction(
  input: { rfpCode: string; claimedAt: string },
): Promise<ActionResult<{ claimedAt: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.renewSendEmbedClaim(rfp.id, parsed.data.claimedAt, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
