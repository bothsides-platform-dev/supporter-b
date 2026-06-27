'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { requireActiveWorkspace } from './_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    columnId: z.string().uuid(),
    color: z.enum(['primary', 'tertiary', 'warning', 'error', 'surface']).nullable(),
  })
  .strict();

export type RecolorColumnInput = z.infer<typeof Input>;
export type RecolorColumnResult = ActionResult;

/** Set (or clear, with null) a column's accent color. */
export async function recolorColumnAction(
  input: RecolorColumnInput,
): Promise<RecolorColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  return (await getBoardService()).recolorColumn(
    parsed.data.columnId,
    parsed.data.color,
    ws.workspaceId,
  );
}
