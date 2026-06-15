'use server';

import { z } from 'zod';

import { getBoardService } from '@/lib/server/services/board';
import { type BoardActionResult, requireActiveWorkspace } from './_shared';

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
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  return (await getBoardService()).renameColumn(
    parsed.data.columnId,
    parsed.data.title,
    ws.workspaceId,
  );
}
