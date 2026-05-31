'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { users } from '@/lib/db/schema';
import { actionDb, normalizeEmail, type AuthActionResult } from './_shared';

const Input = z.object({
  email: z.string().email(),
});

export type CheckEmailAvailableInput = z.infer<typeof Input>;
export type CheckEmailAvailableResult = AuthActionResult;

/**
 * 이메일 중복 여부만 확인하는 read-only 액션.
 * 메일 발송 · 토큰 발급 없이 users 테이블만 조회한다.
 *
 * - ok:true  → 해당 이메일은 가입 가능
 * - ok:false, error:'EMAIL_TAKEN' → 이미 가입된 이메일
 * - ok:false, error:'INVALID_INPUT' → zod 검증 실패
 */
export async function checkEmailAvailableAction(
  input: CheckEmailAvailableInput,
): Promise<CheckEmailAvailableResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);

  const [existing] = await actionDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) return { ok: false, error: 'EMAIL_TAKEN' };

  return { ok: true };
}
