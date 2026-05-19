'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { hashPassword } from '@/lib/auth/password';
import { passwordSchema } from '@/lib/auth/password-validation';
import { users } from '@/lib/db/schema';
import { getVerificationTokenRepo } from '@/lib/server/repositories/factory';
import { hashToken } from '@/lib/server/token';
import { actionDb, type AuthActionResult } from './_shared';

const Input = z.object({
  rawToken: z.string().min(1).max(256),
  password: passwordSchema,
});

export type PasswordResetInput = z.infer<typeof Input>;
export type PasswordResetResult = AuthActionResult<{
  email: string;
  password: string;
}>;

/**
 * P8 — atomic consume of a password_reset token + bcrypt update.
 *
 * Returns the plaintext password so the client can call signIn() right
 * after. NEVER call signIn from here — see advisor block C.
 */
export async function passwordResetAction(
  input: PasswordResetInput,
): Promise<PasswordResetResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    const weak = parsed.error.issues.some(
      (i) => i.path[0] === 'password' && i.message === 'WEAK_PASSWORD',
    );
    return { ok: false, error: weak ? 'WEAK_PASSWORD' : 'INVALID_INPUT' };
  }

  const repo = await getVerificationTokenRepo();
  const consumed = await repo.consume(
    hashToken(parsed.data.rawToken),
    new Date(),
  );
  if (!consumed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
  if (consumed.purpose !== 'password_reset') {
    return { ok: false, error: 'WRONG_PURPOSE' };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const db = actionDb();
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.email, consumed.email));

  return {
    ok: true,
    email: consumed.email,
    password: parsed.data.password,
  };
}
