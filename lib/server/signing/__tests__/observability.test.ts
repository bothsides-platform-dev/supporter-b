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

  // 계약 행이 아직 없는 실패(onAward 유실 스윕)는 contractId·rfpCode 가 없다 — rfpId 가
  // 유일한 식별자다. 이게 빠지면 그 알림은 Sentry 에서 **어느 딜인지 알 수 없는 채로** 뜬다.
  it('carries rfpId for failures that have no contract row yet (sweep path)', () => {
    captureSigningError('signing.sweep_recreated_missing_contract', new Error('db blip'), {
      rfpId: '11111111-2222-3333-4444-555555555555',
    });
    const [, opts] = captureException.mock.calls[0] as [unknown, { extra: Record<string, string> }];
    expect(opts.extra).toEqual({ rfpId: '11111111-2222-3333-4444-555555555555' });
  });

  it('captures a raw (non-SnowSign) error too, with no code tag', () => {
    captureSigningError('signing.persist_failed_after_send', new Error('db blip'), { contractId: 'c1' });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, opts] = captureException.mock.calls[0] as [unknown, { tags: Record<string, string> }];
    expect(opts.tags).toMatchObject({ area: 'signing', event: 'signing.persist_failed_after_send' });
    expect(opts.tags.code).toBeUndefined();
  });

  it('does not forward a raw error message to Sentry (US-region PII safety)', () => {
    // A DB error message could embed a participant row value (name/email). The scrubber
    // does not mask exception .message, and sendDefaultPii is on — so the message must be
    // normalized away for non-SnowSign errors.
    captureSigningError(
      'signing.persist_failed_after_send',
      new Error('duplicate key value ... (john.doe@example.com)'),
      { contractId: 'c1' },
    );
    const [errArg] = captureException.mock.calls[0] as [Error];
    expect(errArg.message).not.toContain('john.doe@example.com');
  });
});
