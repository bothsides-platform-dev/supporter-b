'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { requireActiveWorkspace } from './_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ columnId: z.string().uuid() }).strict();

export type DeleteColumnInput = z.infer<typeof Input>;
export type DeleteColumnResult = ActionResult;

/**
 * Delete a custom column (its placements cascade — cards fall back to
 * auto-classification). System (lifecycle-bound) columns are non-deletable:
 * cross-side protocol columns return COLUMN_CROSS_SIDE_LOCKED; other lifecycle
 * columns return COLUMN_SYSTEM_LOCKED. The two codes drive distinct client
 * messages.
 */
export async function deleteColumnAction(
  input: DeleteColumnInput,
): Promise<DeleteColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  return (await getBoardService()).deleteColumn(parsed.data.columnId, ws.workspaceId);
}
