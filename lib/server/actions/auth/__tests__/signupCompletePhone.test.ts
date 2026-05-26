// signupCompleteAction — phone 인증 필수 검증 테스트
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { phoneOtps, users } from '@/lib/db/schema';
import { hashOtpCode } from '../sendPhoneOtpAction';
import { signupCompleteAction } from '../signupCompleteAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('@/lib/server/sms/solapi', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}));

let db: PgliteDB;

async function seedVerifiedOtp(phone: string): Promise<string> {
  const [row] = await db
    .insert(phoneOtps)
    .values({
      phone,
      codeHash: hashOtpCode('000000'),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      verifiedAt: new Date(),
    })
    .returning();
  return row.id;
}

const BASE = {
  email: 'phone-test@example.com',
  name: '테스터',
  password: 'Password123!',
  wsKind: 'buyer' as const,
  wsName: '(주)테스트',
  phone: '01099998888',
};

beforeEach(async () => {
  db = await setupActionEnv();
});
afterEach(teardownActionEnv);

describe('signupCompleteAction — phone 인증 필수', () => {
  it('phone + phoneVerificationId 없으면 INVALID_INPUT', async () => {
    const r = await signupCompleteAction({
      email: BASE.email,
      name: BASE.name,
      password: BASE.password,
      wsKind: BASE.wsKind,
      wsName: BASE.wsName,
    } as Parameters<typeof signupCompleteAction>[0]);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('phoneVerificationId가 다른 번호의 OTP이면 PHONE_NOT_VERIFIED', async () => {
    const otherId = await seedVerifiedOtp('01011111111');

    const r = await signupCompleteAction({
      ...BASE,
      phone: '01099998888',
      phoneVerificationId: otherId,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PHONE_NOT_VERIFIED');
  });

  it('미검증 OTP(verifiedAt null)이면 PHONE_NOT_VERIFIED', async () => {
    const [unverified] = await db
      .insert(phoneOtps)
      .values({
        phone: BASE.phone,
        codeHash: hashOtpCode('000000'),
        expiresAt: new Date(Date.now() + 5 * 60_000),
        verifiedAt: null,
      })
      .returning();

    const r = await signupCompleteAction({
      ...BASE,
      phoneVerificationId: unverified.id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PHONE_NOT_VERIFIED');
  });

  it('정상 — users.phone에 번호 저장됨', async () => {
    const verificationId = await seedVerifiedOtp(BASE.phone);

    const r = await signupCompleteAction({
      ...BASE,
      phoneVerificationId: verificationId,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [u] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.email, BASE.email));
    expect(u.phone).toBe(BASE.phone);
  });
});
