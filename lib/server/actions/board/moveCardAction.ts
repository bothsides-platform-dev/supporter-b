'use server';

import { z } from 'zod';

import { getColumnRepo } from '@/lib/server/repositories/factory';
import {
  type BoardActionResult,
  workspaceIdForCard,
  kindForCard,
  placementRepoFor,
  cardBelongsToWorkspace,
} from './_shared';

const Input = z
  .object({
    cardType: z.enum(['rfp', 'invitation', 'bid']),
    cardId: z.string().uuid(),
    toColumnId: z.string().uuid(),
    // client-computed fractional index (between drop neighbors).
    position: z.string().min(1),
  })
  .strict();

export type MoveCardInput = z.infer<typeof Input>;
export type MoveCardResult = BoardActionResult;

/**
 * Place a card into a CUSTOM column (the only valid drop target). Drops onto
 * system columns — cross-side protocol, private lifecycle skeleton, and the
 * default-landing column — are rejected; releasing a card back to
 * auto-classification goes through releaseCardAction. Lifecycle-column drops
 * that trigger a domain action are handled client-side. See _shared.ts.
 */
export async function moveCardAction(input: MoveCardInput): Promise<MoveCardResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const { cardType, cardId, toColumnId, position } = parsed.data;

  const ws = await workspaceIdForCard(cardType);
  if (!ws.ok) return ws;

  const colRepo = await getColumnRepo();
  const column = await colRepo.findById(toColumnId);
  if (!column) return { ok: false, error: 'COLUMN_NOT_FOUND' };
  if (column.workspaceId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  if (column.kind !== kindForCard(cardType)) return { ok: false, error: 'CROSS_KIND' };
  // is_system ⇒ non-deletable AND non-place-target (custom columns only).
  if (column.isSystem) return { ok: false, error: 'NOT_A_DROP_TARGET' };

  if (!(await cardBelongsToWorkspace(cardType, cardId, ws.workspaceId))) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  const placementRepo = await placementRepoFor(cardType);
  await placementRepo.upsert(toColumnId, cardId, position);
  return { ok: true };
}
