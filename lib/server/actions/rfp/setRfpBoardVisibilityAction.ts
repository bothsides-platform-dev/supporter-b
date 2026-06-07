'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import { rfps } from '@/lib/db/schema';
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
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = session.user.workspaceId;
  const db = actionDb();

  const [row] = await db
    .select({ id: rfps.id, buyerWsId: rfps.buyerWsId })
    .from(rfps)
    .where(eq(rfps.code, parsed.data.rfpId))
    .limit(1);
  if (!row) return { ok: false, error: 'NOT_FOUND' };
  if (row.buyerWsId !== wsId) return { ok: false, error: 'NOT_OWNED' };

  await db.update(rfps).set({ boardVisible: parsed.data.visible }).where(eq(rfps.id, row.id));
  return { ok: true };
}
