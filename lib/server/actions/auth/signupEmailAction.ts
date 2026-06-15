'use server';

import { z } from 'zod';

import { getUserRepo } from '@/lib/server/repositories/factory';
import {
  normalizeEmail,
  type AuthActionResult,
} from './_shared';
import { issueSignupEmail } from './_issueSignupEmail';

const Input = z.object({
  email: z.string().email(),
  workspaceType: z.enum(['buyer', 'pg']).optional(),
  inviteToken: z.string().min(1).max(256).optional(),
});

export type SignupEmailInput = z.infer<typeof Input>;
export type SignupEmailResult = AuthActionResult<{ email: string }>;

/**
 * P2 — issue a signup_email verification token and enqueue the outbox mail.
 *
 * Pre-signup variant: rejects an email that already belongs to a user
 * (EMAIL_TAKEN). The token issuance itself lives in `issueSignupEmail`, shared
 * with `sendMyEmailVerificationAction` (post-signup resend, no EMAIL_TAKEN).
 */
export async function signupEmailAction(
  input: SignupEmailInput,
): Promise<SignupEmailResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);

  const exists = await (await getUserRepo()).existsByEmail(email);
  if (exists) return { ok: false, error: 'EMAIL_TAKEN' };

  await issueSignupEmail({
    email,
    inviteToken: parsed.data.inviteToken,
    workspaceType: parsed.data.workspaceType,
  });

  return { ok: true, email };
}
