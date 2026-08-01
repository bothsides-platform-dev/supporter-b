'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ rfpCode: z.string().min(1) }).strict();

/**
 * 딜룸 계약 탭 — PG 가 자사 계약서를 올려 보내기 위한 스노우싸인 임베드 세션 발급.
 * ACL(낙찰 PG 인지)·상태(awaiting 인지)·동시성(리스)은 서비스가 검증한다.
 */
export async function issueSigningSendEmbedSessionAction(
  input: { rfpCode: string },
): Promise<ActionResult<{ iframeUrl: string; sessionId: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.createSendEmbedSession(rfp.id, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
