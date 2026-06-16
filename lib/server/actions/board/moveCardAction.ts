'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { type BoardActionResult, workspaceIdForCard } from './_shared';

const Input = z
  .object({
    cardType: z.enum(['rfp', 'invitation', 'bid']),
    cardId: z.string().uuid(),
    toColumnId: z.string().uuid(),
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
  const { cardType, cardId, toColumnId } = parsed.data;

  const ws = await workspaceIdForCard(cardType);
  if (!ws.ok) return ws;

  // workspaceIdForCard already keyed the workspace by card type (buyer for
  // rfp/bid, pg for invitation); the service only needs the resolved id +
  // type. cardType is the discriminator, so type is implied — but moveCard
  // doesn't use workspaceType, so a sentinel keeps the actor shape uniform.
  return (await getBoardService()).moveCard(
    { cardType, cardId, toColumnId },
    { workspaceId: ws.workspaceId, workspaceType: cardType === 'invitation' ? 'pg' : 'buyer' },
  );
}
