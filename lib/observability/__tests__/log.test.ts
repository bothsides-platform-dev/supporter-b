import { beforeEach, describe, expect, it, vi } from 'vitest';

const { info, warn, error } = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ logger: { info, warn, error } }));

import { logBusinessEvent, logBusinessWarn, logBusinessError } from '../log';

beforeEach(() => {
  info.mockReset();
  warn.mockReset();
  error.mockReset();
});

describe('business log helpers', () => {
  it('logBusinessEvent forwards to Sentry.logger.info', () => {
    logBusinessEvent('rfp.sent', { rfpId: 'P-2605-0042' });

    expect(info).toHaveBeenCalledWith('rfp.sent', { rfpId: 'P-2605-0042' });
  });

  it('logBusinessWarn forwards to Sentry.logger.warn', () => {
    logBusinessWarn('outbox.retry', { id: 'x' });

    expect(warn).toHaveBeenCalledWith('outbox.retry', { id: 'x' });
  });

  it('logBusinessError forwards to Sentry.logger.error', () => {
    logBusinessError('award.failed', { rfpId: 'P-1' });

    expect(error).toHaveBeenCalledWith('award.failed', { rfpId: 'P-1' });
  });

  it('never throws even if the logger throws', () => {
    info.mockImplementation(() => {
      throw new Error('logger down');
    });

    expect(() => logBusinessEvent('rfp.sent')).not.toThrow();
  });
});
