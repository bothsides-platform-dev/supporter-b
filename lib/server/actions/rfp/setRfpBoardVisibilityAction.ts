'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getAuditLogRepo, getRfpRepo } from '@/lib/server/repositories/factory';
import { actionDb, type RfpActionResult } from './_shared';

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
 */
export async function setRfpBoardVisibilityAction(
  input: SetRfpBoardVisibilityInput,
): Promise<SetRfpBoardVisibilityResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = actor.workspaceId;
  const db = actionDb();

  const rfpRepo = await getRfpRepo();
  const row = await rfpRepo.findIdAndOwnerByCode(parsed.data.rfpId);
  if (!row) return { ok: false, error: 'NOT_FOUND' };
  if (row.buyerWsId !== wsId) return { ok: false, error: 'NOT_OWNED' };

  const auditRepo = await getAuditLogRepo();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    await rfpRepo.setBoardVisible(row.id, parsed.data.visible, tx);
    // 감사 로그 (C5) — 토글과 같은 트랜잭션에서 커밋.
    await auditRepo.insert(
      {
        actorUserId: actor.userId,
        actorWorkspaceId: wsId,
        action: 'rfp.board_visibility',
        entityType: 'rfp',
        entityId: parsed.data.rfpId,
        metadata: { visible: parsed.data.visible },
      },
      tx,
    );
  });
  return { ok: true };
}
