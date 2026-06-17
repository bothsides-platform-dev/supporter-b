'use server';

import { z } from 'zod';

import { getColumnRepo } from '@/lib/server/repositories/factory';
import { isSystemColumn } from '@/lib/types/column';
import {
  type BoardActionResult,
  workspaceIdForCard,
  setCardBoardColumn,
  cardBelongsToWorkspace,
} from './_shared';

const Input = z
  .object({
    cardType: z.enum(['rfp', 'invitation']),
    cardId: z.string().uuid(),
    toColumnId: z.string().uuid(),
  })
  .strict();

export type MoveCardInput = z.infer<typeof Input>;
export type MoveCardResult = BoardActionResult;

/**
 * Place a card into a CUSTOM column (the only valid drop target). Drops onto
 * system columns — cross-side protocol, lifecycle columns — are rejected;
 * releasing a card back to auto-classification goes through releaseCardAction.
 * Lifecycle-column drops that trigger a domain action are handled client-side.
 * See _shared.ts.
 */
export async function moveCardAction(input: MoveCardInput): Promise<MoveCardResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const { cardType, cardId, toColumnId } = parsed.data;

  const ws = await workspaceIdForCard(cardType);
  if (!ws.ok) return ws;

  const colRepo = await getColumnRepo();
  const column = await colRepo.findById(toColumnId);
  if (!column) return { ok: false, error: 'COLUMN_NOT_FOUND' };
  if (column.workspaceId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  if (column.kind !== 'pipeline') return { ok: false, error: 'CROSS_KIND' };
  // system (lifecycle-bound) columns ⇒ non-deletable AND non-place-target.
  if (isSystemColumn(column)) return { ok: false, error: 'NOT_A_DROP_TARGET' };

  if (!(await cardBelongsToWorkspace(cardType, cardId, ws.workspaceId))) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  await setCardBoardColumn(cardType, cardId, toColumnId);
  return { ok: true };
}
