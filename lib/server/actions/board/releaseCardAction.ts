'use server';

import { z } from 'zod';

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

  if (!(await cardBelongsToWorkspace(cardType, cardId, ws.workspaceId))) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  await setCardBoardColumn(cardType, cardId, null);
  return { ok: true };
}
