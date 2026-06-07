'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().regex(/^P-\d{4}-\d{4}$/),
    workspaceIds: z.array(z.string().uuid()).min(1).max(20),
  })
  .strict();

export type AddPgWorkspacesInput = z.input<typeof Input>;
export type AddPgWorkspacesResult = RfpActionResult<{
  addedCount: number;
  skipped: string[];
}>;

export async function addPgWorkspacesToRfpAction(
  input: AddPgWorkspacesInput,
): Promise<AddPgWorkspacesResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.addPgWorkspaces(
    parsed.data.rfpId,
    parsed.data.workspaceIds,
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
