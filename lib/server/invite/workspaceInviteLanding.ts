import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { normalizeEmail } from '@/lib/server/actions/auth/_shared';

/**
 * 초대 이메일에 이미 계정이 존재하는지 여부 (인증 여부 무관).
 *
 * 비인증 초대 landing 에서 "로그인하여 수락" vs "가입하여 수락"을 가르는 근거(#9).
 * checkEmailAvailableAction 과 달리 **미인증 계정도 true** — 미인증 기존계정이
 * 가입 동선을 끝까지 가다 EMAIL_TAKEN 막다른 길에 빠지는 것을 landing 에서 차단.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function accountExistsForEmail(db: any, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return !!row;
}
