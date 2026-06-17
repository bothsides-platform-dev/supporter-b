'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { getColumnRepo } from '@/lib/server/repositories/factory';
import { type BoardActionResult, requireActiveWorkspace } from './_shared';

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
export type AddColumnResult = BoardActionResult<{ columnId: string }>;

/** Create a custom column on the session's active workspace board. */
export async function addColumnAction(input: AddColumnInput): Promise<AddColumnResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const { kind, title, color, position } = parsed.data;
  const columnId = randomUUID();
  await (await getColumnRepo()).create({
    id: columnId,
    workspaceId: ws.workspaceId,
    kind,
    title,
    position,
    color: color ?? null,
    lifecycleKey: null, // custom column ⇒ deletable
  });
  return { ok: true, columnId };
}
