// signupCompleteAction — signupSource(first-touch 유입 경로) 전달·검증 테스트
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { outboxEntries, phoneOtps, users } from '@/lib/db/schema';
import { hashOtpCode } from '../phoneOtpUtils';
import { signupCompleteAction } from '../signupCompleteAction';
import { signupEmailAction } from '../signupEmailAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve({ get: () => null }) }));
vi.mock('@/lib/server/sms/solapi', () => ({ sendSms: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/server/notifications/admin-signup', () => ({
  notifyAdminNewSignupAfterCommit: vi.fn(),
}));

let db: PgliteDB;

async function seedVerifiedEmail(email: string): Promise<void> {
  await signupEmailAction({ email });
  const [row] = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.toAddr, email.toLowerCase()))
    .limit(1);
  const rawToken = decodeURIComponent(row.html.match(/token=([^"]+)"/)?.[1] ?? '');
  await verifyEmailAction(rawToken);
}

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

const VALID_BIZ_NO = '1248100998';

const BASE = {
  email: 'attrib-test@example.com',
  name: '테스터',
  password: 'Password123!',
  wsKind: 'buyer' as const,
  wsName: '(주)테스트',
  phone: '01099998888',
  bizProfile: {
    bizNo: VALID_BIZ_NO,
    taxType: 'general' as const,
    status: 'active' as const,
  },
};

beforeEach(async () => {
  db = await setupActionEnv();
});
afterEach(teardownActionEnv);

describe('signupCompleteAction — signupSource', () => {
  it('signupSource가 전달되면 users.signup_source에 그대로 저장된다', async () => {
    const verificationId = await seedVerifiedOtp(BASE.phone);
    await seedVerifiedEmail(BASE.email);

    const r = await signupCompleteAction({
      ...BASE,
      phoneVerificationId: verificationId,
      signupSource: { _v: 1, utmSource: 'google', utmCampaign: 'brand' },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [u] = await db
      .select({ signupSource: users.signupSource })
      .from(users)
      .where(eq(users.email, BASE.email));
    expect(u.signupSource).toEqual({ _v: 1, utmSource: 'google', utmCampaign: 'brand' });
  });

  it('signupSource 미전달 시 빈 문서로 남는다', async () => {
    const verificationId = await seedVerifiedOtp(BASE.phone);
    await seedVerifiedEmail(BASE.email);

    const r = await signupCompleteAction({ ...BASE, phoneVerificationId: verificationId });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [u] = await db
      .select({ signupSource: users.signupSource })
      .from(users)
      .where(eq(users.email, BASE.email));
    expect(u.signupSource).toEqual({});
  });

  it('알 수 없는 필드(gclid 등)가 섞여 들어와도 걸러진다', async () => {
    const verificationId = await seedVerifiedOtp(BASE.phone);
    await seedVerifiedEmail(BASE.email);

    const r = await signupCompleteAction({
      ...BASE,
      phoneVerificationId: verificationId,
      // @ts-expect-error 의도적으로 미지 필드를 섞어 서버 clamp 를 검증
      signupSource: { _v: 1, utmSource: 'google', gclid: 'abc123' },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [u] = await db
      .select({ signupSource: users.signupSource })
      .from(users)
      .where(eq(users.email, BASE.email));
    expect(u.signupSource).toEqual({ _v: 1, utmSource: 'google' });
  });
});
