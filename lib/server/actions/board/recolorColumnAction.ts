'use server';

import { z } from 'zod';

import { getColumnRepo } from '@/lib/server/repositories/factory';
import { type BoardActionResult, requireOwnedColumn } from './_shared';

const Input = z
  .object({
    columnId: z.string().uuid(),
    color: z.enum(['primary', 'tertiary', 'warning', 'error', 'surface']).nullable(),
  })
  .strict();

export type RecolorColumnInput = z.infer<typeof Input>;
export type RecolorColumnResult = BoardActionResult;

/** Set (or clear, with null) a column's accent color. */
export async function recolorColumnAction(
  input: RecolorColumnInput,
): Promise<RecolorColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const owned = await requireOwnedColumn(parsed.data.columnId);
  if (!owned.ok) return owned;
  await (await getColumnRepo()).update(parsed.data.columnId, { color: parsed.data.color });
  return { ok: true };
}
