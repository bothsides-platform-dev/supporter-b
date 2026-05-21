'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { users } from '@/lib/db/schema';
import { getVerificationTokenRepo } from '@/lib/server/repositories/factory';
import { hashToken } from '@/lib/server/token';
import { actionDb, isUniqueViolation, type AuthActionResult } from './_shared';

const Input = z.object({ rawToken: z.string().min(1).max(256) });

export type EmailChangeConfirmInput = z.infer<typeof Input>;
export type EmailChangeConfirmResult = AuthActionResult;

/**
 * P11 — atomic consume of an email_change token + users.email update.
 *
 * meta.userId selects the row; meta.newEmail is the new address (also the
 * `email` column of the verification row, but we trust meta for the update
 * to keep the contract explicit).
 */
export async function emailChangeConfirmAction(
  input: EmailChangeConfirmInput,
): Promise<EmailChangeConfirmResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const repo = await getVerificationTokenRepo();
  const consumed = await repo.consume(
    hashToken(parsed.data.rawToken),
    new Date(),
  );
  if (!consumed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
  if (consumed.purpose !== 'email_change') {
    return { ok: false, error: 'WRONG_PURPOSE' };
  }

  const meta = (consumed.meta ?? {}) as Record<string, unknown>;
  const userId = typeof meta.userId === 'string' ? meta.userId : undefined;
  const newEmail =
    typeof meta.newEmail === 'string' ? meta.newEmail : consumed.email;
  if (!userId || !newEmail) {
    return { ok: false, error: 'TOKEN_META_CORRUPT' };
  }

  const db = actionDb();
  try {
    await db.update(users).set({ email: newEmail }).where(eq(users.id, userId));
  } catch (err) {
    // New address already in use → expected. Anything else is unexpected and
    // must propagate (onRequestError → Sentry) rather than read as EMAIL_TAKEN.
    if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
    throw err;
  }
  return { ok: true };
}
