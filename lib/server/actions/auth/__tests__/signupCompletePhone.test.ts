// signupCompleteAction — phone 인증 필수 검증 테스트
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

vi.mock('@/lib/server/sms/solapi', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}));

// New signup → admin email notice. Spy on the notifier (lazy closure so the
// factory eval doesn't touch notifyMock before init).
const notifyMock = vi.fn();
vi.mock('@/lib/server/notifications/admin-signup', () => ({
  notifyAdminNewSignupAfterCommit: (...args: unknown[]) => notifyMock(...args),
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

// 유효한 체크섬 사업자번호 (삼성전자: 124-81-00998)
const VALID_BIZ_NO = '1248100998';

const BASE = {
  email: 'phone-test@example.com',
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
    await seedVerifiedEmail(BASE.email);

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

  it('하이픈 형식 입력 — 숫자 OTP와 매칭하고 users.phone은 숫자로 저장', async () => {
    // 프론트는 010-1234-5678 하이픈 형식으로 제출하지만 OTP는 숫자로 저장됨.
    const verificationId = await seedVerifiedOtp('01012345678');
    await seedVerifiedEmail(BASE.email);

    const r = await signupCompleteAction({
      ...BASE,
      phone: '010-1234-5678',
      phoneVerificationId: verificationId,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [u] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.email, BASE.email));
    expect(u.phone).toBe('01012345678');
  });

  it('정상 가입 시 운영자 이메일 승인요청 알림을 트리거한다', async () => {
    notifyMock.mockClear();
    const verificationId = await seedVerifiedOtp(BASE.phone);
    await seedVerifiedEmail(BASE.email);

    const r = await signupCompleteAction({
      ...BASE,
      phoneVerificationId: verificationId,
    });

    expect(r.ok).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const arg = notifyMock.mock.calls[0][0] as {
      workspaceName: string;
      orgType: string;
      reviewUrl: string;
    };
    expect(arg.workspaceName).toBe(BASE.wsName);
    expect(arg.orgType).toBe('buyer');
    expect(arg.reviewUrl).toContain('/admin/review/');
  });
});
