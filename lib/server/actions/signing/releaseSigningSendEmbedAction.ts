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
 * 딜룸 계약 탭 — 발송 임베드를 닫을 때 리스를 반납한다.
 *
 * 반납이 없으면 방금 닫은 담당자가 리스 만료(30분)까지 자기 자신에게 잠긴다.
 * `claimedAt` 은 세션 발급 때 받은 값이며, 서비스가 정확일치일 때만 푼다 —
 * 뒤늦게 도착한 옛 닫기가 남의 살아있는 클레임을 풀지 못하게 하는 가드다.
 */
export async function releaseSigningSendEmbedAction(
  input: { rfpCode: string; claimedAt: string },
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.releaseSendEmbedClaim(rfp.id, parsed.data.claimedAt, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
