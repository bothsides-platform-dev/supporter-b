import { describe, expect, it } from 'vitest';

import { scrubEvent } from '../scrubber';

describe('scrubEvent', () => {
  it('masks keyword-sensitive keys but keeps benign siblings', () => {
    const out = scrubEvent({ extra: { bizNo: '123-45-67890', title: 'ok' } });

    expect(out.extra.bizNo).toBe('[Filtered]');
    expect(out.extra.title).toBe('ok');
  });

  it('masks substring-sensitive header keys, case-insensitively', () => {
    const out = scrubEvent({
      request: {
        headers: {
          Authorization: 'Bearer abc',
          'X-Secret-Key': 'shh',
          'content-type': 'application/json',
        },
      },
    });

    expect(out.request.headers.Authorization).toBe('[Filtered]');
    expect(out.request.headers['X-Secret-Key']).toBe('[Filtered]');
    expect(out.request.headers['content-type']).toBe('application/json');
  });

  it('recurses into nested arrays and objects', () => {
    const out = scrubEvent({
      extra: { nested: [{ 계좌: '110-1234-5678' }], cardFees: 1000 },
    });

    expect(out.extra.nested[0]['계좌']).toBe('[Filtered]');
    expect(out.extra.cardFees).toBe('[Filtered]');
  });

  it('returns the event and never masks message/stack strings (documented leak surface)', () => {
    const event = {
      message: 'lookup failed for bizNo 123-45-67890',
      exception: { values: [{ value: 'token=abc leaked' }] },
      extra: { ok: 1 },
    };

    const out = scrubEvent(event);

    expect(out).toBe(event);
    expect(out.message).toBe('lookup failed for bizNo 123-45-67890');
    expect(out.exception.values[0].value).toBe('token=abc leaked');
    expect(out.extra.ok).toBe(1);
  });
});
