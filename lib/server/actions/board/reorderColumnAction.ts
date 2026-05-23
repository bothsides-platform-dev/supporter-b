'use server';

import { z } from 'zod';

import { getColumnRepo } from '@/lib/server/repositories/factory';
import { type BoardActionResult, requireOwnedColumn } from './_shared';

const Input = z
  .object({ columnId: z.string().uuid(), position: z.string().min(1) })
  .strict();

export type ReorderColumnInput = z.infer<typeof Input>;
export type ReorderColumnResult = BoardActionResult;

/** Move a column to a new position (client-computed fractional index). Allowed
 *  on system columns. */
export async function reorderColumnAction(
  input: ReorderColumnInput,
): Promise<ReorderColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const owned = await requireOwnedColumn(parsed.data.columnId);
  if (!owned.ok) return owned;
  await (await getColumnRepo()).update(parsed.data.columnId, { position: parsed.data.position });
  return { ok: true };
}
