'use server';

import { z } from 'zod';
import { signIn, auth } from '@/auth';
import { captureActionError } from '@/lib/observability/capture';
import { normalizeEmail, type AuthActionResult } from './_shared';

// Auth.js throws AuthError subclasses that each set an own `type`. Bad creds →
// 'CredentialsSignin'; a denied signIn callback → 'AccessDenied'. Both are
// EXPECTED login failures we must not report. Anything else (e.g. a DB outage
// surfaces as 'CallbackRouteError', or a non-AuthError) is unexpected.
const EXPECTED_LOGIN_ERROR_TYPES = new Set(['CredentialsSignin', 'AccessDenied']);

function isExpectedLoginError(e: unknown): boolean {
  const type = (e as { type?: unknown } | null)?.type;
  return typeof type === 'string' && EXPECTED_LOGIN_ERROR_TYPES.has(type);
}

const Input = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof Input>;
export type LoginResult = AuthActionResult<{ email: string; workspaceType?: string }>;

/**
 * P1 — wrap Auth.js v5 signIn('credentials', { redirect: false }).
 *
 * On success the cookie is set server-side by Auth.js; the client just calls
 * router.push(next || '/home'). Failures bubble up as `ok: false` so the form
 * can render an error without a 302 round-trip.
 */
export async function loginAction(input: LoginInput): Promise<LoginResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);
  try {
    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirect: false,
    });
    const session = await auth();
    return { ok: true, email, workspaceType: session?.user?.workspaceType };
  } catch (e) {
    // Surface a single generic error to avoid leaking which half of the pair
    // was wrong (matches the "single failure mode" UX in P1). Report only
    // unexpected failures — expected bad-creds errors would be quota noise.
    if (!isExpectedLoginError(e)) captureActionError('loginAction', e);
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }
}
