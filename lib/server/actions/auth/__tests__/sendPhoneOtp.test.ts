import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('@/lib/server/sms/solapi', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}));

import { sendPhoneOtpAction } from '../sendPhoneOtpAction';
import { sendSms } from '@/lib/server/sms/solapi';

let db: PgliteDB;

beforeEach(async () => {
  db = await setupActionEnv();
  vi.clearAllMocks();
});
afterEach(teardownActionEnv);

describe('sendPhoneOtpAction', () => {
  it('유효한 번호 → phone_otps 레코드 생성 + SMS 발송', async () => {
    const r = await sendPhoneOtpAction({ phone: '010-1234-5678' });

    expect(r.ok).toBe(true);

    const rows = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01012345678'));
    expect(rows).toHaveLength(1);
    expect(rows[0].verifiedAt).toBeNull();
    expect(sendSms).toHaveBeenCalledOnce();
    const [to, text] = (sendSms as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(to).toBe('01012345678');
    expect(text).toMatch(/\d{6}/);
  });

  it('하이픈 없는 번호도 정규화해서 저장', async () => {
    const r = await sendPhoneOtpAction({ phone: '01056785678' });
    expect(r.ok).toBe(true);
    const rows = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01056785678'));
    expect(rows).toHaveLength(1);
  });

  it('잘못된 번호 형식 → INVALID_PHONE', async () => {
    const r = await sendPhoneOtpAction({ phone: '02-123-4567' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_PHONE');
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('빈 번호 → INVALID_PHONE', async () => {
    const r = await sendPhoneOtpAction({ phone: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_PHONE');
  });

  it('10분 내 3회 발송 → 4번째는 RATE_LIMITED', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await sendPhoneOtpAction({ phone: '010-0000-0001' });
      expect(r.ok).toBe(true);
    }
    const r = await sendPhoneOtpAction({ phone: '010-0000-0001' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('RATE_LIMITED');
    expect(sendSms).toHaveBeenCalledTimes(3);
  });

  it('다른 번호는 rate limit 영향 없음', async () => {
    for (let i = 0; i < 3; i++) {
      await sendPhoneOtpAction({ phone: '010-0000-0001' });
    }
    const r = await sendPhoneOtpAction({ phone: '010-0000-0002' });
    expect(r.ok).toBe(true);
  });

  it('SMS 발송 실패 → SMS_FAILED + phone_otps 롤백', async () => {
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('SignatureDoesNotMatch'));

    const r = await sendPhoneOtpAction({ phone: '010-1111-2222' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('SMS_FAILED');
    const rows = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01011112222'));
    expect(rows).toHaveLength(0);
  });

  it('OTP 만료 시간이 5분 뒤로 설정됨', async () => {
    const before = new Date();
    await sendPhoneOtpAction({ phone: '010-9999-9999' });
    const after = new Date();

    const [row] = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01099999999'));
    const expiresMs = new Date(row.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before.getTime() + 4 * 60_000);
    expect(expiresMs).toBeLessThanOrEqual(after.getTime() + 6 * 60_000);
  });
});
