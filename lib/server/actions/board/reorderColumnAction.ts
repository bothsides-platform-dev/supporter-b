'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { requireActiveWorkspace } from './_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({ columnId: z.string().uuid(), position: z.string().min(1) })
  .strict();

export type ReorderColumnInput = z.infer<typeof Input>;
export type ReorderColumnResult = ActionResult;

/** Move a column to a new position (client-computed fractional index). Allowed
 *  on system columns. */
export async function reorderColumnAction(
  input: ReorderColumnInput,
): Promise<ReorderColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  return (await getBoardService()).reorderColumn(
    parsed.data.columnId,
    parsed.data.position,
    ws.workspaceId,
  );
}
