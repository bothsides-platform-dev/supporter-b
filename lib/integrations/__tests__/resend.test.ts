// ResendSender coverage — both env modes.
//
// We mock the `resend` SDK so no network calls happen and we can drive
// success/error paths deterministically.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxEntry } from '@/lib/server/outbox/types';

const sendMock = vi.fn();

vi.mock('resend', () => {
  class FakeResend {
    public emails = { send: sendMock };
    constructor(_key: string) {
      // capture key not needed — the live module decides whether to construct.
      void _key;
    }
  }
  return { Resend: FakeResend };
});

function makeEntry(overrides?: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: 'entry-id',
    event: 'auth.verify',
    to: 'kim@toss.im',
    subject: 'Supporter B 인증',
    html: '<a href="https://x.test/v?t=1">click</a>',
    dedupeKey: 'signup-verify:kim@toss.im:0',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    scheduledAt: new Date().toISOString(),
    ...overrides,
  };
}

const ORIGINAL_KEY = process.env.RESEND_API_KEY;
const ORIGINAL_FROM = process.env.RESEND_FROM;

beforeEach(() => {
  sendMock.mockReset();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
});

afterEach(() => {
  if (ORIGINAL_KEY) process.env.RESEND_API_KEY = ORIGINAL_KEY;
  else delete process.env.RESEND_API_KEY;
  if (ORIGINAL_FROM) process.env.RESEND_FROM = ORIGINAL_FROM;
  else delete process.env.RESEND_FROM;
});

describe('ResendSender', () => {
  it('falls back to console when RESEND_API_KEY is absent (no html logged)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();

    const entry = makeEntry({
      event: 'rfp.invited',
      to: 'pg@toss.im',
      subject: '[P-2605-0042] 제안 요청 도착',
      html: '<a href="https://example.com/very-long-html">x</a>',
      dedupeKey: 'rfp:P-2605-0042:invite:pg@toss.im',
    });
    const result = await ResendSender(entry);

    expect(result).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('[email DEV]');
    expect(line).toContain('event=rfp.invited');
    expect(line).toContain('to=pg@toss.im');
    expect(line).toContain('subject=[P-2605-0042] 제안 요청 도착');
    expect(line).toContain('dedupeKey=rfp:P-2605-0042:invite:pg@toss.im');
    // html intentionally excluded from the dev line.
    expect(line).not.toContain('<a href');
    logSpy.mockRestore();
  });

  it('calls Resend with from/to/subject/html on success', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM = 'noreply@bidit.test';
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const result = await ResendSender(makeEntry());

    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@bidit.test',
      to: 'kim@toss.im',
      subject: 'Supporter B 인증',
      html: expect.stringContaining('<a'),
    });
  });

  it('uses the default from when RESEND_FROM is unset', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({ data: { id: 'msg' }, error: null });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    await ResendSender(makeEntry());

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'send@supporter-b.store' }),
    );
  });

  it('maps Resend API error to { ok:false }', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'invalid_to_address', message: 'invalid recipient' },
    });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const result = await ResendSender(makeEntry());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid recipient');
  });

  it('catches thrown errors from the SDK', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockRejectedValue(new Error('network down'));

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const result = await ResendSender(makeEntry());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('network down');
  });
});
