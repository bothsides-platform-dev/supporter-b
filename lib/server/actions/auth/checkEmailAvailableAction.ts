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
 * - ok:true  → 가입 가능 (미등록 또는 미인증 — 미인증은 이어서 가입, 결정 #2)
 * - ok:false, error:'EMAIL_TAKEN' → 이미 인증 완료된 계정
 * - ok:false, error:'INVALID_INPUT' → zod 검증 실패
 */
export async function checkEmailAvailableAction(
  input: CheckEmailAvailableInput,
): Promise<CheckEmailAvailableResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);

  const [existing] = await actionDb()
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // 인증 완료된 계정만 차단. 미인증(중단된 가입)은 이어서 가입 허용 → purge 후 재생성.
  if (existing?.emailVerified) return { ok: false, error: 'EMAIL_TAKEN' };

  return { ok: true };
}
