import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import { hashOtpCode } from '../phoneOtpUtils';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('@/lib/server/sms/solapi', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}));

import { verifyPhoneOtpAction } from '../verifyPhoneOtpAction';

let db: PgliteDB;

async function seedOtp(
  phone: string,
  code: string,
  opts: { expiresInMs?: number; verifiedAt?: Date | null; attempts?: number } = {},
) {
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 5 * 60_000));
  const [row] = await db
    .insert(phoneOtps)
    .values({
      phone,
      purpose: 'signup',
      userId: null,
      codeHash: hashOtpCode(code),
      expiresAt,
      verifiedAt: opts.verifiedAt ?? null,
      proofExpiresAt: opts.verifiedAt ? new Date(Date.now() + 5 * 60_000) : null,
      attempts: opts.attempts ?? 0,
    })
    .returning();
  return row;
}

beforeEach(async () => {
  db = await setupActionEnv();
});
afterEach(teardownActionEnv);

describe('verifyPhoneOtpAction', () => {
  it('병렬 오입력도 인증번호당 5회까지만 검증해요', async () => {
    await seedOtp('01012345678', '999999');

    const results = await Promise.all(Array.from({ length: 12 }, () =>
      verifyPhoneOtpAction({ phone: '01012345678', code: '000000' }),
    ));

    expect(results.filter((result) => !result.ok && result.error === 'INVALID_CODE')).toHaveLength(5);
    expect(results.filter((result) => !result.ok && result.error === 'MAX_ATTEMPTS')).toHaveLength(7);
    const [row] = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01012345678'));
    expect(row.attempts).toBe(5);
    expect(row.verifiedAt).toBeNull();
  });

  it('올바른 코드 → verificationId 반환 + verifiedAt 기록', async () => {
    await seedOtp('01012345678', '123456');

    const r = await verifyPhoneOtpAction({ phone: '010-1234-5678', code: '123456' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verificationId).toBeTruthy();

    const [row] = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01012345678'));
    expect(row.verifiedAt).not.toBeNull();
    expect(row.proofExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('틀린 코드 → INVALID_CODE + attempts 증가', async () => {
    await seedOtp('01012345678', '999999');

    const r = await verifyPhoneOtpAction({ phone: '01012345678', code: '000000' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CODE');

    const [row] = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01012345678'));
    expect(row.attempts).toBe(1);
  });

  it('5회 시도 초과 → MAX_ATTEMPTS', async () => {
    await seedOtp('01012345678', '999999', { attempts: 5 });

    const r = await verifyPhoneOtpAction({ phone: '01012345678', code: '999999' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('MAX_ATTEMPTS');
  });

  it('만료된 OTP → INVALID_CODE', async () => {
    await seedOtp('01012345678', '123456', { expiresInMs: -1 });

    const r = await verifyPhoneOtpAction({ phone: '01012345678', code: '123456' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CODE');
  });

  it('이미 사용된 OTP → INVALID_CODE', async () => {
    await seedOtp('01012345678', '123456', { verifiedAt: new Date() });

    const r = await verifyPhoneOtpAction({ phone: '01012345678', code: '123456' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CODE');
  });

  it('존재하지 않는 번호 → INVALID_CODE', async () => {
    const r = await verifyPhoneOtpAction({ phone: '010-9999-9999', code: '123456' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CODE');
  });

  it('반환된 verificationId로 해당 레코드 식별 가능', async () => {
    await seedOtp('01011112222', '654321');

    const r = await verifyPhoneOtpAction({ phone: '01011112222', code: '654321' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db
      .select()
      .from(phoneOtps)
      .where(eq(phoneOtps.id, r.verificationId));
    expect(row.phone).toBe('01011112222');
    expect(row.verifiedAt).not.toBeNull();
  });
});
