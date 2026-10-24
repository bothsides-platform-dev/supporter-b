'use server';

import { isSessionVersionStale } from '@/lib/auth/session-version';
import { emailVerificationTarget } from './_emailVerificationTarget';
import { auth } from '@/auth';
import { getUserRepo } from '@/lib/server/repositories/factory';

/**
 * 현재 로그인한 유저의 이메일 인증 여부를 DB 에서 읽어 반환한다.
 * /pending-approval 의 인증 섹션이 폴링해 ✓ 로 전환하는 데 사용 (JWT 가 아니라
 * DB 가 진실의 원천 — 다른 탭/기기에서 인증해도 반영됨).
 */
export async function checkMyEmailVerifiedAction(expectedEmail?: string): Promise<{ verified: boolean; reauthenticate?: boolean; next?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { verified: false, ...(expectedEmail ? { reauthenticate: true } : {}) };
  if (expectedEmail && session?.user?.email?.toLowerCase() !== expectedEmail.toLowerCase()) return { verified: false };

  const repo = await getUserRepo();
  const u = session?.user?.email ? await repo.findAuthRowByEmail(session.user.email) : undefined;
  // Activation and version increment are atomic: never combine two snapshots.
  if (!u || u.id !== userId || u.deletedAt || isSessionVersionStale(session?.user?.sessionVersion, u.sessionVersion)) {
    return { verified: false, reauthenticate: true };
  }
  const next = u?.emailVerified && session ? await emailVerificationTarget(session) : undefined;
  return { verified: u?.emailVerified ?? false, ...(next ? { next } : {}) };
}
