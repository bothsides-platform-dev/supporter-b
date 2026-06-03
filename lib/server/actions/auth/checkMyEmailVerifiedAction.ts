'use server';

import { auth } from '@/auth';
import { getUserRepo } from '@/lib/server/repositories/factory';

/**
 * 현재 로그인한 유저의 이메일 인증 여부를 DB 에서 읽어 반환한다.
 * /pending-approval 의 인증 섹션이 폴링해 ✓ 로 전환하는 데 사용 (JWT 가 아니라
 * DB 가 진실의 원천 — 다른 탭/기기에서 인증해도 반영됨).
 */
export async function checkMyEmailVerifiedAction(): Promise<{ verified: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { verified: false };

  const repo = await getUserRepo();
  const u = await repo.findById(userId);
  return { verified: u?.emailVerified ?? false };
}
