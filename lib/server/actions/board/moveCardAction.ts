'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { workspaceIdForCard } from './_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    cardType: z.enum(['rfp', 'invitation']),
    cardId: z.string().uuid(),
    toColumnId: z.string().uuid(),
  })
  .strict();

export type MoveCardInput = z.infer<typeof Input>;
export type MoveCardResult = ActionResult;

/**
 * Place a card into a CUSTOM column (the only valid drop target). Drops onto
 * system columns — cross-side protocol, lifecycle columns — are rejected;
 * releasing a card back to auto-classification goes through releaseCardAction.
 * Lifecycle-column drops that trigger a domain action are handled client-side.
 * See services/board.ts.
 */
export async function moveCardAction(input: MoveCardInput): Promise<MoveCardResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const { cardType, cardId, toColumnId } = parsed.data;

  const ws = await workspaceIdForCard(cardType);
  if (!ws.ok) return ws;

  return (await getBoardService()).moveCard(
    { cardType, cardId, toColumnId },
    { workspaceId: ws.workspaceId, workspaceType: cardType === 'invitation' ? 'pg' : 'buyer' },
  );
}
