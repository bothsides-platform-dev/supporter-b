'use server';

import { getAuthService } from '@/lib/server/services/auth';
import type { AuthActionResult } from './_shared';

export type VerifyEmailResult = AuthActionResult<{
  email: string;
  inviteToken?: string;
  workspaceType?: 'buyer' | 'pg';
}>;

/**
 * P4 — atomic consume of a signup_email verification token.
 *
 * Returns `{ ok: true, email, inviteToken? }` on success so the client can
 * stash both back into sessionStorage and choose the right next step.
 *
 * The verification-token repo's UPDATE WHERE … AND consumed_at IS NULL AND
 * expires_at > now() is the race-safe surface; a second call with the same
 * raw token returns `undefined` (covered by verification-token.test.ts).
 */
export async function verifyEmailAction(
  rawToken: string,
): Promise<VerifyEmailResult> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false, error: 'INVALID_TOKEN' };
  }

  return (await getAuthService()).verifyEmailToken(rawToken);
}
