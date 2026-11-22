'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireBuyerActor, requirePgActor } from '../_session';
import { answerContact, reportContact } from '../../services/consultation-contact';
const id = z.string().uuid();
export async function reportContactAction(reviewId: string, expectedQuestion: string | null) {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  if (!id.safeParse(reviewId).success || !id.nullable().safeParse(expectedQuestion).success)
    return { ok: false as const, error: 'INVALID_INPUT' };
  const result = await reportContact(reviewId, actor, expectedQuestion);
  if (result.ok) revalidatePath('/inbox/[id]', 'page');
  return result;
}
export async function answerContactAction(questionId: string, received: boolean) {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  if (!id.safeParse(questionId).success || typeof received !== 'boolean')
    return { ok: false as const, error: 'INVALID_INPUT' };
  const result = await answerContact(questionId, received, { actor });
  if (result.ok) revalidatePath('/rfp/[id]', 'page');
  return result;
}
