'use server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { getAlimtalkRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '../_result';
const Input = z.object({ enabled: z.boolean() }).strict();
export async function updateBusinessAlimtalkAction(input: {
  enabled: boolean;
}): Promise<ActionResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  let session;
  try {
    session = await requireSession({ allowInactiveWorkspace: true });
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  try {
    const saved = await (
      await getAlimtalkRepo()
    ).setPreference(session.user.id, parsed.data.enabled);
    return saved ? { ok: true } : { ok: false, error: 'SAVE_FAILED' };
  } catch {
    return { ok: false, error: 'SAVE_FAILED' };
  }
}
