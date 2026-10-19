import { describe, expect, it } from 'vitest';

import { deepScrub, scrubEvent } from '../scrubber';

describe('scrubEvent', () => {
  it.each(['self', 'mutual', 'array'] as const)('serializes %s cycles without losing stack frames or masking', (kind) => {
    const shared = { email: 'private@example.com', label: 'keep' };
    const input: Record<string, unknown> = { left: shared, right: shared };
    if (kind === 'self') input.self = input;
    if (kind === 'mutual') input.child = { parent: input };
    if (kind === 'array') { const array: unknown[] = [input]; array.push(array); input.items = array; }
    const frames = Array.from({ length: 80 }, (_, lineno) => ({ filename: 'app.js', function: 'render', lineno }));
    const event = { exception: { values: [{ type: 'Error', value: 'original failure', stacktrace: { frames } }] }, data: { arguments: [input] } };

    const out = scrubEvent(event);
    expect(out).toBe(event);
    expect(out.exception.values[0].stacktrace.frames).toEqual(frames);
    expect(out.data.arguments[0].left).toEqual({ email: '[Filtered]', label: 'keep' });
    expect(out.data.arguments[0].right).toEqual(out.data.arguments[0].left);
    expect(JSON.stringify(out)).toContain('[Circular ~]');
    expect(JSON.stringify(out)).not.toContain('private@example.com');
    expect(shared.email).toBe('private@example.com');
  });

  it('bounds deeply nested telemetry before scrubbing it', () => {
    let nested: unknown = { email: 'private@example.com' };
    for (let i = 0; i < 20_000; i++) nested = { child: nested };
    const out = deepScrub({ label: 'keep', nested });
    const json = JSON.stringify(out);
    expect(json).toContain('keep');
    expect(json).not.toContain('private@example.com');
    expect(json.length).toBeLessThan(2000);
  });

  it('bounds wide telemetry while retaining ordinary fields', () => {
    const out = deepScrub({ label: 'keep', data: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`field${i}`, i])) }) as { label: string; data: object };
    expect(out.label).toBe('keep');
    expect(Object.keys(out.data).length).toBeLessThan(2000);
  });

  it('masks values produced by serialization before they leave the process', () => {
    const out = deepScrub({ toJSON: () => ({ email: 'private@example.com', url: 'https://hooks.slack.com/services/T/B/secret', label: 'keep' }) });
    expect(JSON.parse(JSON.stringify(out))).toEqual({ email: '[Filtered]', url: '[Filtered]', label: 'keep' });
  });

  it('does not retain original fields discarded by normalization on the event', () => {
    const event = { ...Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`field${i}`, i])), email: 'private@example.com' };
    const out = scrubEvent(event);
    expect(out).toBe(event);
    expect(Object.keys(out).length).toBeLessThan(2000);
    expect(JSON.stringify(out)).not.toContain('private@example.com');
  });

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


it('scrubs credential URLs in transaction spans, breadcrumbs and exception strings', () => {
  const url = 'https://hooks.slack.com/services/T000/B000/test-webhook-secret';
  const event = scrubEvent({
    spans: [{ description: `POST ${url}`, data: { 'http.url': url } }],
    breadcrumbs: [{ message: url, data: { url } }],
    exception: { values: [{ value: `request failed ${url}` }] },
  });
  expect(JSON.stringify(event)).not.toContain('test-webhook-secret');
  expect(event.spans[0].description).toContain('POST');
});

it('scrubs mail addressing and content from telemetry attributes', () => {
  const event = scrubEvent({ extra: { to: 'private@example.com', subject: 'private subject', dedupeKey: 'mail:private@example.com', outboxId: 'job-1' } });
  expect(event.extra).toEqual({ to: '[Filtered]', subject: '[Filtered]', dedupeKey: '[Filtered]', outboxId: 'job-1' });
});
