'use server';

import { z } from 'zod';

import { getColumnRepo } from '@/lib/server/repositories/factory';
import { isCrossSideLifecycleKey } from '@/lib/server/columns/lifecycle-keys';
import { isSystemColumn } from '@/lib/types/column';
import { type BoardActionResult, requireOwnedColumn } from './_shared';

const Input = z.object({ columnId: z.string().uuid() }).strict();

export type DeleteColumnInput = z.infer<typeof Input>;
export type DeleteColumnResult = BoardActionResult;

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
  const owned = await requireOwnedColumn(parsed.data.columnId);
  if (!owned.ok) return owned;

  if (isSystemColumn(owned.column)) {
    return {
      ok: false,
      error: isCrossSideLifecycleKey(owned.column.lifecycleKey)
        ? 'COLUMN_CROSS_SIDE_LOCKED'
        : 'COLUMN_SYSTEM_LOCKED',
    };
  }

  await (await getColumnRepo()).remove(parsed.data.columnId);
  return { ok: true };
}
