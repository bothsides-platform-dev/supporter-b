'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().regex(/^P-\d{4}-\d{4}$/),
    visible: z.boolean(),
  })
  .strict();

export type SetRfpBoardVisibilityInput = z.input<typeof Input>;
export type SetRfpBoardVisibilityResult = RfpActionResult;

/**
 * 구매사가 자신의 RFP를 오픈 게시판에 노출할지 토글(opt-out). 기본은 노출(true).
 * UI 는 이 값을 생성 시 한 번만 정하고 이후 읽기 전용이지만, admin/recovery 용으로
 * 서버 액션은 남긴다. 소유권·트랜잭션·감사 로그는 서비스가 소유한다.
 */
export async function setRfpBoardVisibilityAction(
  input: SetRfpBoardVisibilityInput,
): Promise<SetRfpBoardVisibilityResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.setBoardVisible(parsed.data.rfpId, parsed.data.visible, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
