'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getBidService } from '@/lib/server/services/bid';
import type { BidActionResult } from './_shared';

const Input = z.object({ noteId: z.string().uuid() }).strict();

export type RemoveBidNoteInput = z.infer<typeof Input>;
export type RemoveBidNoteResult = BidActionResult;

export async function removeBidNoteAction(input: RemoveBidNoteInput): Promise<RemoveBidNoteResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getBidService();
  return service.removeNote(
    parsed.data.noteId,
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
