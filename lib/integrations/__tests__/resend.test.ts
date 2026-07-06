// ResendSender coverage — both env modes.
//
// We mock the `resend` SDK so no network calls happen and we can drive
// success/error paths deterministically.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxEntry } from '@/lib/server/outbox/types';
import { logger } from '@/lib/observability/logger';

const sendMock = vi.fn();
const batchSendMock = vi.fn();

vi.mock('resend', () => {
  class FakeResend {
    public emails = { send: sendMock };
    public batch = { send: batchSendMock };
    constructor(_key: string) {
      // capture key not needed — the live module decides whether to construct.
      void _key;
    }
  }
  return { Resend: FakeResend };
});

vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeEntry(overrides?: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: 'entry-id',
    event: 'auth.verify',
    to: 'kim@toss.im',
    subject: '서포트 B 인증',
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
  batchSendMock.mockReset();
  vi.mocked(logger.info).mockReset();
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
      subject: '[P-2605-0042] 견적 요청이 도착했어요',
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
    expect(line).toContain('subject=[P-2605-0042] 견적 요청이 도착했어요');
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
    expect(sendMock).toHaveBeenCalledWith(
      {
        from: 'noreply@bidit.test',
        to: 'kim@toss.im',
        subject: '서포트 B 인증',
        html: expect.stringContaining('<a'),
      },
      // Idempotency key = the outbox row id, so a crash/DB-failure after a
      // successful send doesn't re-deliver on the next flush.
      { idempotencyKey: 'entry-id' },
    );
  });

  it('emits an email.sent operational log on success', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    await ResendSender(makeEntry({ event: 'rfp.invited', to: 'pg@toss.im' }));

    expect(logger.info).toHaveBeenCalledWith(
      'email.sent',
      expect.objectContaining({
        event: 'rfp.invited',
        to: 'pg@toss.im',
        messageId: 'msg_123',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('uses the default from when RESEND_FROM is unset', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({ data: { id: 'msg' }, error: null });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    await ResendSender(makeEntry());

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'send@supporter-b.store' }),
      expect.anything(),
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
    if (!result.ok) {
      expect(result.error).toBe('network down');
      // A thrown (network) error is transient → retryable so the outbox backs
      // off and retries rather than giving up.
      expect(result.retryable).toBe(true);
    }
  });

  it('classifies a rate-limit API error as retryable', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
    });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const result = await ResendSender(makeEntry());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });

  it('classifies a validation API error as permanent (not retryable)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'bad recipient', statusCode: 422 },
    });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const result = await ResendSender(makeEntry());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
  });

  it('returns permanent failure in production when RESEND_API_KEY is empty string', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();

    const result = await ResendSender(makeEntry());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('resend_api_key_empty');
      expect(result.retryable).toBe(false);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('classifyResendError', () => {
  it('marks rate-limit / quota / 5xx as retryable', async () => {
    const { classifyResendError } = await import('../resend');
    expect(classifyResendError({ name: 'rate_limit_exceeded' }).retryable).toBe(true);
    expect(classifyResendError({ name: 'daily_quota_exceeded' }).retryable).toBe(true);
    expect(classifyResendError({ name: 'monthly_quota_exceeded' }).retryable).toBe(true);
    expect(classifyResendError({ name: 'internal_server_error' }).retryable).toBe(true);
    expect(classifyResendError({ statusCode: 429 }).retryable).toBe(true);
    expect(classifyResendError({ statusCode: 503 }).retryable).toBe(true);
  });

  it('marks validation / auth / 4xx as permanent', async () => {
    const { classifyResendError } = await import('../resend');
    expect(classifyResendError({ name: 'validation_error' }).retryable).toBe(false);
    expect(classifyResendError({ name: 'invalid_from_address' }).retryable).toBe(false);
    expect(classifyResendError({ name: 'missing_required_field' }).retryable).toBe(false);
    expect(classifyResendError({ name: 'restricted_api_key' }).retryable).toBe(false);
    expect(classifyResendError({ statusCode: 422 }).retryable).toBe(false);
    expect(classifyResendError({ statusCode: 403 }).retryable).toBe(false);
  });

  it('defaults unknown errors to retryable (maxAttempts caps the runaway)', async () => {
    const { classifyResendError } = await import('../resend');
    expect(classifyResendError({}).retryable).toBe(true);
    expect(classifyResendError(undefined).retryable).toBe(true);
    expect(classifyResendError({ name: 'something_new' }).retryable).toBe(true);
  });
});

describe('ResendBatchSender', () => {
  it('falls back to a per-entry console line for every entry when RESEND_API_KEY is absent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();

    const entries = [
      makeEntry({ id: 'e1', to: 'a@e.com', event: 'rfp.invited' }),
      makeEntry({ id: 'e2', to: 'b@e.com', event: 'rfp.invited' }),
    ];
    const results = await ResendBatchSender(entries);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(batchSendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][0]).toContain('[email DEV]');
    expect(logSpy.mock.calls[0][0]).toContain('to=a@e.com');
    expect(logSpy.mock.calls[1][0]).toContain('to=b@e.com');
    logSpy.mockRestore();
  });

  it('returns [] without calling the API for an empty batch', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const results = await ResendBatchSender([]);
    expect(results).toEqual([]);
    expect(batchSendMock).not.toHaveBeenCalled();
  });

  it('sends the whole batch in ONE permissive batch.send call and maps all ok on success', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM = 'noreply@bidit.test';
    batchSendMock.mockResolvedValue({
      data: { data: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] },
      error: null,
    });

    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const entries = [
      makeEntry({ id: 'e1', to: 'a@e.com' }),
      makeEntry({ id: 'e2', to: 'b@e.com' }),
      makeEntry({ id: 'e3', to: 'c@e.com' }),
    ];
    const results = await ResendBatchSender(entries);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(batchSendMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = batchSendMock.mock.calls[0];
    expect(payload).toHaveLength(3);
    expect(payload[0]).toEqual({
      from: 'noreply@bidit.test',
      to: 'a@e.com',
      subject: '서포트 B 인증',
      html: expect.stringContaining('<a'),
    });
    expect(opts.batchValidation).toBe('permissive');
    // Deterministic idempotency key derived from entry ids + content — a retry with
    // identical ids+html dedupes; recomputed content (digest) gets a fresh key.
    expect(typeof opts.idempotencyKey).toBe('string');
    expect(opts.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('derives a stable batch idempotency key from entry ids+content (order-independent)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    batchSendMock.mockResolvedValue({ data: { data: [{ id: 'm1' }, { id: 'm2' }] }, error: null });

    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const a = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];
    const b = [makeEntry({ id: 'e2' }), makeEntry({ id: 'e1' })]; // same set, reordered
    const c = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e3' })]; // different set

    await ResendBatchSender(a);
    await ResendBatchSender(b);
    await ResendBatchSender(c);
    const keyA = batchSendMock.mock.calls[0][1].idempotencyKey;
    const keyB = batchSendMock.mock.calls[1][1].idempotencyKey;
    const keyC = batchSendMock.mock.calls[2][1].idempotencyKey;

    expect(keyA).toBe(keyB); // same id set → same key (dedupe a crash-retry)
    expect(keyA).not.toBe(keyC); // different subset → different key (no false dedupe)
  });

  it('maps a permissive partial failure: errors[].index → permanent, others ok', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    // Real Resend SDK shape for permissive partial failures: `errors`, NOT `failed`.
    batchSendMock.mockResolvedValue({
      data: { data: [{ id: 'm1' }, { id: 'm3' }], errors: [{ index: 1, message: 'invalid recipient' }] },
      error: null,
    });

    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const entries = [
      makeEntry({ id: 'e1', to: 'a@e.com' }),
      makeEntry({ id: 'e2', to: 'bad' }),
      makeEntry({ id: 'e3', to: 'c@e.com' }),
    ];
    const results = await ResendBatchSender(entries);

    expect(results[0]).toEqual({ ok: true });
    expect(results[2]).toEqual({ ok: true });
    expect(results[1].ok).toBe(false);
    if (!results[1].ok) expect(results[1].retryable).toBe(false);
  });

  it('maps a whole-batch rate-limit error to retryable failures for every entry', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    batchSendMock.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
    });

    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];
    const results = await ResendBatchSender(entries);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.retryable).toBe(true);
    }
  });

  it('maps a thrown SDK error to retryable failures for every entry', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    batchSendMock.mockRejectedValue(new Error('socket hang up'));

    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];
    const results = await ResendBatchSender(entries);

    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.retryable).toBe(true);
    }
  });

  it('returns permanent failure for every entry in production when RESEND_API_KEY is empty string', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    const { ResendBatchSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();

    const entries = [
      makeEntry({ id: 'e1', to: 'a@e.com' }),
      makeEntry({ id: 'e2', to: 'b@e.com' }),
    ];
    const results = await ResendBatchSender(entries);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe('resend_api_key_empty');
        expect(r.retryable).toBe(false);
      }
    }
    expect(batchSendMock).not.toHaveBeenCalled();
  });
});
