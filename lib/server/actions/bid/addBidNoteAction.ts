'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getBidService } from '@/lib/server/services/bid';
import type { BidActionResult } from './_shared';

const MAX_BODY = 2000;

const Input = z
  .object({
    bidId: z.string().uuid(),
    body: z.string().max(MAX_BODY).default(''),
    attachmentIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict();

export type AddBidNoteInput = z.infer<typeof Input>;
export type AddBidNoteResult = BidActionResult<{ noteId: string }>;

export async function addBidNoteAction(input: AddBidNoteInput): Promise<AddBidNoteResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getBidService();
  return service.addNote(
    {
      bidId: parsed.data.bidId,
      body: parsed.data.body,
      attachmentIds: parsed.data.attachmentIds,
    },
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
