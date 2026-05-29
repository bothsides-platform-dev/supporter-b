// sendAdminEmail coverage — 운영자에게 보내는 알림 메일(Resend 직접 발송).
// `resend` SDK 를 mock 하여 네트워크 없이 env 모드별 동작을 검증한다.
// (ResendSender 테스트의 env-mode 패턴 미러)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => {
  class FakeResend {
    public emails = { send: sendMock };
    constructor(_key: string) {
      void _key;
    }
  }
  return { Resend: FakeResend };
});

const ORIGINAL = {
  key: process.env.RESEND_API_KEY,
  from: process.env.RESEND_FROM,
  to: process.env.ADMIN_NOTIFY_EMAIL,
};

beforeEach(() => {
  sendMock.mockReset();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.ADMIN_NOTIFY_EMAIL;
});

afterEach(() => {
  for (const [k, v] of [
    ['RESEND_API_KEY', ORIGINAL.key],
    ['RESEND_FROM', ORIGINAL.from],
    ['ADMIN_NOTIFY_EMAIL', ORIGINAL.to],
  ] as const) {
    if (v !== undefined) process.env[k] = v;
    else delete process.env[k];
  }
});

describe('sendAdminEmail', () => {
  it('skips (no send) and logs when ADMIN_NOTIFY_EMAIL is unset', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendAdminEmail } = await import('../admin-email');

    const result = await sendAdminEmail({ subject: '새 심사 요청', html: '<p>x</p>' });

    expect(result).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0] as string).toContain('[admin-email DEV]');
    logSpy.mockRestore();
  });

  it('falls back to console when RESEND_API_KEY is absent (recipient set)', async () => {
    process.env.ADMIN_NOTIFY_EMAIL = 'ops@bidit.test';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendAdminEmail } = await import('../admin-email');

    const result = await sendAdminEmail({ subject: '새 심사 요청', html: '<p>x</p>' });

    expect(result).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('[admin-email DEV]');
    expect(line).toContain('to=ops@bidit.test');
    // html 은 로깅하지 않는다.
    expect(line).not.toContain('<p>x</p>');
    logSpy.mockRestore();
  });

  it('sends via Resend with from/to/subject/html when fully configured', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM = 'noreply@bidit.test';
    process.env.ADMIN_NOTIFY_EMAIL = 'ops@bidit.test';
    sendMock.mockResolvedValue({ data: { id: 'm1' }, error: null });

    const { sendAdminEmail } = await import('../admin-email');
    const result = await sendAdminEmail({ subject: '새 심사 요청', html: '<p>hi</p>' });

    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@bidit.test',
      to: ['ops@bidit.test'],
      subject: '새 심사 요청',
      html: '<p>hi</p>',
    });
  });

  it('sends to multiple comma-separated recipients (trimmed, blanks dropped)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ADMIN_NOTIFY_EMAIL = 'a@x.test, b@y.test ,, c@z.test';
    sendMock.mockResolvedValue({ data: { id: 'm1' }, error: null });

    const { sendAdminEmail } = await import('../admin-email');
    await sendAdminEmail({ subject: 's', html: 'h' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['a@x.test', 'b@y.test', 'c@z.test'] }),
    );
  });

  it('skips when ADMIN_NOTIFY_EMAIL has only blanks/commas', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ADMIN_NOTIFY_EMAIL = ' , ,';
    const { sendAdminEmail } = await import('../admin-email');

    const result = await sendAdminEmail({ subject: 's', html: 'h' });

    expect(result).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('maps a Resend API error to { ok:false }', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ADMIN_NOTIFY_EMAIL = 'ops@bidit.test';
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'invalid', message: 'bad recipient' },
    });

    const { sendAdminEmail } = await import('../admin-email');
    const result = await sendAdminEmail({ subject: 's', html: 'h' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('bad recipient');
  });
});
