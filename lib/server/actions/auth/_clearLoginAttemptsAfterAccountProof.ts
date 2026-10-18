import { headers } from 'next/headers';
import {
  clearLoginAttempts,
  clientIpFromHeaders,
} from '@/lib/server/auth/login-rate-limit';

/**
 * A successful signup or password reset proves control of the account flow.
 * Clear a stale pre-auth lock so the caller's immediate auto-login can reach
 * the shared Credentials verifier. The durable account change has already
 * committed, so limiter cleanup is deliberately best-effort.
 */
export async function clearLoginAttemptsAfterAccountProof(email: string): Promise<void> {
  try {
    await clearLoginAttempts({
      email,
      ip: clientIpFromHeaders(await headers()),
    });
  } catch {
    // Do not turn an already-committed signup/reset into an ambiguous failure.
  }
}
