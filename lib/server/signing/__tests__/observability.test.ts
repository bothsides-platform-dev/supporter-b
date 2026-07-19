import { afterEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { captureSigningError } from '../observability';
import { SnowSignError } from '../snowsign-client';

afterEach(() => captureException.mockClear());

describe('captureSigningError', () => {
  it('skips self-healing transient SnowSign codes (free-plan quota protection)', () => {
    captureSigningError('signing.reconcile_failed', new SnowSignError('SNOWSIGN_NETWORK'));
    captureSigningError('signing.reconcile_failed', new SnowSignError('SNOWSIGN_RATE_LIMIT'));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures abnormal SnowSign codes with signing tags and no PII', () => {
    captureSigningError('signing.send_failed', new SnowSignError('SNOWSIGN_MALFORMED'), {
      contractId: 'c1',
      providerRef: 'ref1',
      rfpCode: 'P-1',
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, opts] = captureException.mock.calls[0] as [unknown, { tags: Record<string, string>; extra: Record<string, string> }];
    expect(opts.tags).toMatchObject({
      area: 'signing',
      event: 'signing.send_failed',
      code: 'SNOWSIGN_MALFORMED',
    });
    expect(opts.extra).toEqual({ contractId: 'c1', providerRef: 'ref1', rfpCode: 'P-1' });
    // PII 부재 — 참여자 email/name 은 절대 넣지 않는다.
    expect(JSON.stringify(opts)).not.toMatch(/email|name/i);
  });

  it('captures a raw (non-SnowSign) error too, with no code tag', () => {
    captureSigningError('signing.persist_failed_after_send', new Error('db blip'), { contractId: 'c1' });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, opts] = captureException.mock.calls[0] as [unknown, { tags: Record<string, string> }];
    expect(opts.tags).toMatchObject({ area: 'signing', event: 'signing.persist_failed_after_send' });
    expect(opts.tags.code).toBeUndefined();
  });
});
