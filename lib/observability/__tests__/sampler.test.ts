import { describe, expect, it } from 'vitest';

import { tracesSampler } from '../sampler';

describe('tracesSampler', () => {
  it('drops the /monitoring tunnel route (by span name)', () => {
    expect(tracesSampler({ name: 'POST /monitoring' })).toBe(0);
  });

  it('drops the SSE notifications stream (by http.target attribute)', () => {
    expect(
      tracesSampler({ attributes: { 'http.target': '/api/notifications/stream' } }),
    ).toBe(0);
  });

  it('samples normal routes at 0.1 (by normalizedRequest url)', () => {
    expect(tracesSampler({ normalizedRequest: { url: 'https://app.test/home' } })).toBe(
      0.1,
    );
  });

  it('defaults to 0.1 when no url-bearing shape is present', () => {
    expect(tracesSampler({})).toBe(0.1);
  });
});
