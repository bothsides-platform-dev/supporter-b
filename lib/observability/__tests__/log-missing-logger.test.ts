import { describe, expect, it, vi } from 'vitest';

// Sentry build without a `logger` (e.g. an older/edge surface). The helpers must
// degrade to a no-op rather than throw.
vi.mock('@sentry/nextjs', () => ({}));

import { logBusinessEvent, logBusinessWarn, logBusinessError } from '../log';

describe('business log helpers without Sentry.logger', () => {
  it('do not throw when the logger is absent', () => {
    expect(() => logBusinessEvent('rfp.sent', { rfpId: 'P-1' })).not.toThrow();
    expect(() => logBusinessWarn('outbox.retry')).not.toThrow();
    expect(() => logBusinessError('award.failed')).not.toThrow();
  });
});
