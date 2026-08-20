'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ rfpCode: z.string().min(1), takeOver: z.boolean().optional() }).strict();

/**
 * 딜룸 계약 탭 — 낙찰 견적에 연결된 **조항형 서식**으로 발송한다.
 *
 * 템플릿 지름길(`sendSigningContractFromTemplateAction`)의 형제다. 종류에 따라 딜룸이
 * 갈라 보내며, 잘못 온 종류는 서비스의 종류 게이트가 `TEMPLATE_KIND_MISMATCH` 로
 * 막는다. ACL(낙찰 PG)·상태(awaiting)·서식 연결 여부도 전부 서비스가 검증한다 —
 * 액션은 세션 확인과 입력 파싱만 한다.
 *
 * `takeOver` 는 이어받기 확인 다이얼로그를 통과했을 때만 실린다(동료 리스 강제 취득).
 */
export async function sendComposedSigningContractAction(
  input: { rfpCode: string; takeOver?: boolean },
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };

  const service = await getContractSigningService();
  const svcActor = { userId: actor.userId, workspaceId: actor.workspaceId };
  return parsed.data.takeOver
    ? service.sendComposedContract(rfp.id, svcActor, { takeOver: true })
    : service.sendComposedContract(rfp.id, svcActor);
}
