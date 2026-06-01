// flushAfterCommit smoke. The function is fire-and-forget so we test:
//   - calling it doesn't throw or block (returns synchronously, void)
//   - outbox.flush() executes after after()'s callback resolves
//   - errors thrown inside flush are caught (logged, not propagated)
//
// `after` from next/server is mocked to invoke the callback immediately so
// tests don't need a real Vercel runtime. The factory is also stubbed so the
// test stays decoupled from the real Drizzle/pglite stack.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/observability/logger';

const flushMock = vi.fn();

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void>) => { void cb(); }),
}));

vi.mock('@/lib/server/repositories/factory', () => ({
  getOutboxRepo: async () => ({
    flush: flushMock,
  }),
}));

vi.mock('@/lib/integrations/resend', () => ({
  getResendSender: () => async () => ({ ok: true }),
}));

vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  flushMock.mockReset();
  vi.mocked(logger.error).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('flushAfterCommit', () => {
  it('schedules outbox.flush via after() and resolves with sender', async () => {
    flushMock.mockResolvedValue({ ok: 2, failed: 0 });
    const { flushAfterCommit } = await import('../post-commit');

    flushAfterCommit();

    // after() mock calls the callback immediately, but the async internals
    // (getOutboxRepo, flush) still settle on microtasks.
    await new Promise((r) => setImmediate(r));
    expect(flushMock).toHaveBeenCalledTimes(1);
    expect(flushMock).toHaveBeenCalledWith(expect.any(Function), 50);
  });

  it('swallows flush errors and logs via logger.error (does not propagate)', async () => {
    flushMock.mockRejectedValue(new Error('db down'));
    const { flushAfterCommit } = await import('../post-commit');

    expect(() => flushAfterCommit()).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(logger.error).toHaveBeenCalledWith(
      'outbox.post_commit_failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
});
