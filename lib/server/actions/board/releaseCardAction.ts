'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { type BoardActionResult, workspaceIdForCard } from './_shared';

const Input = z
  .object({
    cardType: z.enum(['rfp', 'invitation', 'bid']),
    cardId: z.string().uuid(),
  })
  .strict();

export type ReleaseCardInput = z.infer<typeof Input>;
export type ReleaseCardResult = BoardActionResult;

/**
 * Remove a card's explicit placement so it falls back to auto-classification
 * (its lifecycle / default-landing column). Invoked when a card is dropped onto
 * the default-landing column or via the "자동 분류로 되돌리기" card-menu action.
 * No-op if the card has no placement.
 */
export async function releaseCardAction(
  input: ReleaseCardInput,
): Promise<ReleaseCardResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const { cardType, cardId } = parsed.data;

  const ws = await workspaceIdForCard(cardType);
  if (!ws.ok) return ws;

  return (await getBoardService()).releaseCard(
    { cardType, cardId },
    { workspaceId: ws.workspaceId, workspaceType: cardType === 'invitation' ? 'pg' : 'buyer' },
  );
}
