import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!session.current) throw new Error('UNAUTHENTICATED');
    return Promise.resolve(session.current);
  },
}));

vi.mock('@/lib/server/sms/solapi', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}));

import { sendPhoneOtpAction } from '../sendPhoneOtpAction';
import { verifyPhoneOtpAction } from '../verifyPhoneOtpAction';
import { sendSms } from '@/lib/server/sms/solapi';

let db: PgliteDB;

beforeEach(async () => {
  db = await setupActionEnv();
  session.current = null;
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

  it('프로필 변경용 OTP는 로그인한 사용자에게만 발급한다', async () => {
    const input = {
      phone: '010-1234-5678',
      purpose: 'profile_phone_update' as const,
    };

    const r = await sendPhoneOtpAction(input);

    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(sendSms).not.toHaveBeenCalled();
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

  it('동시 요청도 10분 내 3건만 예약하고 발송한다', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        sendPhoneOtpAction({ phone: index % 2 === 0 ? '010-0000-0003' : '01000000003' }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(
      results.filter((result) => !result.ok && result.error === 'RATE_LIMITED'),
    ).toHaveLength(5);
    expect(sendSms).toHaveBeenCalledTimes(3);

    const rows = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01000000003'));
    expect(rows).toHaveLength(3);
  });

  it('다른 번호는 rate limit 영향 없음', async () => {
    for (let i = 0; i < 3; i++) {
      await sendPhoneOtpAction({ phone: '010-0000-0001' });
    }
    const r = await sendPhoneOtpAction({ phone: '010-0000-0002' });
    expect(r.ok).toBe(true);
  });

  it('SMS 발송 실패 → SMS_FAILED + 인증 불가능한 예약으로 유지', async () => {
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('SignatureDoesNotMatch'));

    const r = await sendPhoneOtpAction({ phone: '010-1111-2222' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('SMS_FAILED');
    const rows = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01011112222'));
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('SMS 공급자 실패도 발송 예산을 소비한다', async () => {
    vi.mocked(sendSms)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'));

    const firstThree = await Promise.all(
      Array.from({ length: 3 }, () => sendPhoneOtpAction({ phone: '010-1111-3333' })),
    );
    const fourth = await sendPhoneOtpAction({ phone: '010-1111-3333' });

    expect(firstThree.every((result) => !result.ok && result.error === 'SMS_FAILED')).toBe(true);
    expect(fourth).toEqual({ ok: false, error: 'RATE_LIMITED' });
    expect(sendSms).toHaveBeenCalledTimes(3);
  });

  it('SMS 공급자 응답 전 예약은 인증에 사용할 수 없다', async () => {
    let rejectSend!: (error: Error) => void;
    let sentCode = '';
    let markSendStarted!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      markSendStarted = resolve;
    });
    const pendingSend = new Promise<never>((_resolve, reject) => {
      rejectSend = reject;
    });
    vi.mocked(sendSms).mockImplementationOnce(async (_phone, text) => {
      sentCode = text.match(/\d{6}/)?.[0] ?? '';
      markSendStarted();
      await pendingSend;
    });

    const sendResultPromise = sendPhoneOtpAction({ phone: '010-2222-3333' });
    await sendStarted;
    const verifyResult = await verifyPhoneOtpAction({
      phone: '010-2222-3333',
      code: sentCode,
    });
    rejectSend(new Error('response lost'));
    const sendResult = await sendResultPromise;

    expect(verifyResult).toEqual({ ok: false, error: 'INVALID_CODE' });
    expect(sendResult).toEqual({ ok: false, error: 'SMS_FAILED' });
    const [row] = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, '01022223333'));
    expect(row.verifiedAt).toBeNull();
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
