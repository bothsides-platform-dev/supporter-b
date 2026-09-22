'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActiveWorkspace, requirePgActor } from '@/lib/server/actions/_session';
import { AgreementDraftSchema } from '@/lib/contract-doc/agreement';
import { getAgreementService } from '@/lib/server/services/agreement';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { logger } from '@/lib/observability/logger';

const Id = z.object({ contractId: z.uuid() }).strict();
const Save = Id.extend({
  revision: z.number().int().nonnegative(),
  parties: AgreementDraftSchema,
}).strict();
const Send = Id.extend({ stamp: z.string().min(1).max(64) }).strict();

export async function getAgreementAction(input: z.infer<typeof Id>) {
  const actor = await requireActiveWorkspace();
  if (!actor.ok) return actor;
  const parsed = Id.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'INVALID_INPUT' };
  try {
    return await (await getAgreementService()).load(parsed.data.contractId, actor);
  } catch (error) {
    logger.error('signing.agreement_load_failed', { err: String(error) });
    return { ok: false as const, error: 'AGREEMENT_LOAD_FAILED' };
  }
}

export async function saveAgreementAction(input: z.infer<typeof Save>) {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Save.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'INVALID_INPUT' };
  try {
    const result = await (
      await getAgreementService()
    ).save(parsed.data.contractId, actor, parsed.data.revision, parsed.data.parties);
    if (result.ok) {
      revalidatePath('/home');
      revalidatePath('/inbox', 'layout');
    }
    return result;
  } catch (error) {
    logger.error('signing.agreement_save_failed', { err: String(error) });
    return { ok: false as const, error: 'AGREEMENT_SAVE_FAILED' };
  }
}

export async function sendAgreementAction(input: z.infer<typeof Send>) {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Send.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'INVALID_INPUT' };
  try {
    const result = await (
      await getContractSigningService()
    ).sendAgreement(parsed.data.contractId, actor, parsed.data.stamp);
    if (result.ok) {
      revalidatePath('/home');
      revalidatePath('/inbox', 'layout');
    }
    return result;
  } catch (error) {
    logger.error('signing.agreement_send_failed', { err: String(error) });
    return { ok: false as const, error: 'AGREEMENT_SEND_FAILED' };
  }
}
