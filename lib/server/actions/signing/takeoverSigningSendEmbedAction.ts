'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ rfpCode: z.string().min(1) }).strict();

/**
 * 동료가 쥔 발송 리스를 **강제로 이어받아** 임베드 세션을 발급한다.
 *
 * **`issueSigningSendEmbedSessionAction` 과 별개의 액션인 것이 요점이다.** 기본 액션에
 * `takeOver` 플래그를 얹으면 어느 호출부가 그걸 켜는지 계속 추적해야 하고, 실수로
 * 켜진 기본값이 조용히 동료를 밀어낸다. 뺏는 경로는 이름부터 뺏는다고 말한다.
 *
 * 밀려난 동료에게는 인앱 알림이 가고, 그 알림이 SSE 로 그 사람 브라우저에 닿아
 * 임베드 패널을 즉시 내린다(스노우싸인에 세션 취소 API 가 없어, 우리 iframe 을
 * 내리는 것이 실제 차단이다). 감사 로그·알림·CAS 는 전부 서비스가 소유한다.
 */
export async function takeoverSigningSendEmbedAction(input: {
  rfpCode: string;
}): Promise<ActionResult<{ iframeUrl: string; sessionId: string; claimedAt: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.createSendEmbedSession(
    rfp.id,
    { userId: actor.userId, workspaceId: actor.workspaceId },
    { takeOver: true },
  );
}
