'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { signIn, auth } from '@/auth';
import { captureActionError } from '@/lib/observability/capture';
import {
  checkLoginLock,
  recordLoginFailure,
  clearLoginAttempts,
} from '@/lib/server/auth/login-rate-limit';
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

// Client IP from the proxy (Caddy sets x-forwarded-for). Returns null outside a
// request scope (e.g. unit tests) so the limiter falls back to email-only.
async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim() || null;
    return h.get('x-real-ip');
  } catch {
    return null;
  }
}

const Input = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof Input>;
export type LoginResult = AuthActionResult<{
  email: string;
  workspaceType?: string;
}> & { lockedUntil?: string };

/**
 * P1 — wrap Auth.js v5 signIn('credentials', { redirect: false }).
 *
 * On success the cookie is set server-side by Auth.js; the client just calls
 * router.push(next || '/home'). Failures bubble up as `ok: false` so the form
 * can render an error without a 302 round-trip.
 *
 * Brute-force guard (F1): a server-authoritative per-email + per-IP lock runs
 * BEFORE bcrypt, so an attacker hitting this action directly is throttled and
 * can't pin server CPU with cost-12 hashes.
 */
export async function loginAction(input: LoginInput): Promise<LoginResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);
  const ip = await clientIp();
  const now = new Date();

  const lock = await checkLoginLock({ email, ip, now });
  if (lock.locked) {
    return {
      ok: false,
      error: 'LOCKED',
      lockedUntil: lock.lockedUntil?.toISOString(),
    };
  }

  try {
    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirect: false,
    });
    await clearLoginAttempts({ email, ip });
    const session = await auth();
    return { ok: true, email, workspaceType: session?.user?.workspaceType };
  } catch (e) {
    // Report only unexpected failures — expected bad-creds errors would be
    // quota noise. A single generic error avoids leaking which half was wrong.
    if (isExpectedLoginError(e)) {
      // Genuine bad-credential attempt — count it toward the lock. Unexpected
      // errors (DB outage etc.) must NOT lock real users out.
      await recordLoginFailure({ email, ip, now });
    } else {
      captureActionError('loginAction', e);
    }
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }
}
