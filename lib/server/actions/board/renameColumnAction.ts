'use server';

import { z } from 'zod';

import { getColumnRepo } from '@/lib/server/repositories/factory';
import { type BoardActionResult, requireOwnedColumn } from './_shared';

const Input = z
  .object({ columnId: z.string().uuid(), title: z.string().min(1).max(40) })
  .strict();

export type RenameColumnInput = z.infer<typeof Input>;
export type RenameColumnResult = BoardActionResult;

/** Rename a column — allowed on system columns too (only delete is locked). */
export async function renameColumnAction(
  input: RenameColumnInput,
): Promise<RenameColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const owned = await requireOwnedColumn(parsed.data.columnId);
  if (!owned.ok) return owned;
  await (await getColumnRepo()).update(parsed.data.columnId, { title: parsed.data.title });
  return { ok: true };
}
