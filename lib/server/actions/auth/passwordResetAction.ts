'use server';

import { z } from 'zod';
import { passwordSchema } from '@/lib/auth/password-validation';
import { type AuthActionResult } from './_shared';
import { getAuthService } from '@/lib/server/services/auth';
import { clearLoginAttemptsAfterAccountProof } from './_clearLoginAttemptsAfterAccountProof';

const Input = z.object({
  rawToken: z.string().min(1).max(256),
  password: passwordSchema,
});

export type PasswordResetInput = z.infer<typeof Input>;
export type PasswordResetResult = AuthActionResult<{
  email: string;
  password: string;
}>;

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

  const svc = await getAuthService();
  const result = await svc.resetPassword({ rawToken: parsed.data.rawToken, plainPassword: parsed.data.password });
  if (!result.ok) return result;
  // Possession of the one-time reset token proves account control. Release a
  // stale brute-force lock so the existing post-reset Credentials auto-login
  // still works now that every callback shares the limiter.
  await clearLoginAttemptsAfterAccountProof(result.email);
  return { ok: true, email: result.email, password: parsed.data.password };
}
