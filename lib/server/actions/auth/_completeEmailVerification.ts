import { emailVerificationTarget } from './_emailVerificationTarget';
import { unstable_update } from '@/auth';
import { withVerificationSessionRenewal, type VerificationSessionRenewal } from '@/lib/auth/verification-session';
import type { VerifyEmailResult } from './verifyEmailAction';

export async function completeEmailVerification(result: VerifyEmailResult & { sessionRenewal?: VerificationSessionRenewal }): Promise<VerifyEmailResult> {
  if (!result.ok) return result;
  const { sessionRenewal, ...publicResult } = result;
  if (!sessionRenewal) return publicResult;
  try {
    const session = await withVerificationSessionRenewal(sessionRenewal, () => unstable_update({}));
    if (session?.user?.id !== sessionRenewal.userId || session.user.sessionVersion !== sessionRenewal.toVersion) {
      return { ...publicResult, reauthenticate: true };
    }
    const next = await emailVerificationTarget(session);
    return { ...publicResult, ...(next ? { next } : {}) };
  } catch {
    // The proof is already consumed; do not ask the user to submit it again.
    return { ...publicResult, reauthenticate: true };
  }
}
