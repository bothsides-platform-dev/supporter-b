'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { requireActiveWorkspace } from './_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    kind: z.enum(['pipeline']),
    title: z.string().min(1).max(40),
    color: z.enum(['primary', 'tertiary', 'warning', 'error', 'surface']).optional(),
    // client-computed fractional index (placed after a chosen neighbor).
    position: z.string().min(1),
  })
  .strict();

export type AddColumnInput = z.infer<typeof Input>;
export type AddColumnResult = ActionResult<{ columnId: string }>;

/** Create a custom column on the session's active workspace board. */
export async function addColumnAction(input: AddColumnInput): Promise<AddColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const { kind, title, color, position } = parsed.data;
  return (await getBoardService()).addColumn(
    { kind, title, color, position },
    { workspaceId: ws.workspaceId, workspaceType: ws.workspaceType },
  );
}
