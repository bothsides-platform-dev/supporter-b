import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardPublicAgentRequest,
  PUBLIC_AGENT_MAX_TRACKED_IPS,
  PUBLIC_AGENT_REQUESTS_PER_IP,
  PUBLIC_AGENT_REQUESTS_PER_WINDOW,
  __resetPublicAgentBudgetForTest,
} from '../public-guard';

const BUYER = 'https://support-b.test';

function request(headers: HeadersInit = {}, path = '/api/agent/mcp', method = 'POST') {
  return new Request(`${BUYER}${path}`, { method, headers });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', BUYER);
  vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.support-b.test');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
  __resetPublicAgentBudgetForTest();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('public discovery boundary', () => {
  it('allows CLI requests without Origin and GET navigation from external docs', () => {
    expect(guardPublicAgentRequest(request())).toBeNull();
    expect(guardPublicAgentRequest(request({ origin: BUYER }))).toBeNull();
    expect(guardPublicAgentRequest(request({ 'sec-fetch-site': 'cross-site' }, '/developers/agents.md', 'GET'))).toBeNull();
  });

  it.each(['https://attacker.test', 'null', 'http://support-b.test', 'https://support-b.test:444', 'https://support-b.test/'])('rejects invalid Origin %s without reflecting it', async origin => {
    const rejected = guardPublicAgentRequest(request({ origin }));
    expect(rejected?.status).toBe(403);
    expect(await rejected?.json()).toEqual({ error: { code: 'ORIGIN_NOT_ALLOWED' } });
    expect(rejected?.headers.get('cache-control')).toBe('no-store');
    expect(rejected?.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it.each(['partner.support-b.test', 'unknown.test', 'support-b.test:444', 'support-b.test.attacker.test'])('rejects unlisted Host %s despite forwarded headers', async host => {
    const rejected = guardPublicAgentRequest(request({ host, 'x-forwarded-host': 'support-b.test', 'x-forwarded-proto': 'https' }));
    expect(rejected?.status).toBe(404);
    expect(await rejected?.json()).toEqual({ error: { code: 'NOT_FOUND' } });
    expect(rejected?.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('checks the ingress Host when the internal Request URL differs', () => {
    expect(guardPublicAgentRequest(new Request('http://127.0.0.1:3000/api/agent/mcp', {
      method: 'POST', headers: { host: 'SUPPORT-B.TEST', origin: BUYER },
    }))).toBeNull();
    expect(guardPublicAgentRequest(new Request('https://unknown.test/api/agent/mcp'))?.status).toBe(404);
  });

  it('retains the configured localhost port', () => {
    vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'http://localhost:3000');
    expect(guardPublicAgentRequest(new Request('http://localhost:3000/api/agent/mcp'))).toBeNull();
    expect(guardPublicAgentRequest(new Request('http://localhost:3001/api/agent/mcp'))?.status).toBe(404);
  });

  it('fails closed for partial or malformed origin configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', '');
    expect(guardPublicAgentRequest(request())?.status).toBe(503);
    vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.support-b.test');
    vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'not-a-url');
    const rejected = guardPublicAgentRequest(request());
    expect(rejected?.status).toBe(503);
    expect(await rejected?.json()).toEqual({ error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});

describe('process discovery budgets', () => {
  it('shares a per-IP budget across REST, MCP, and guide and ignores spoofed first hops', () => {
    const paths = ['/api/agent/mcp', '/api/agent/v1/services', '/developers/agents.md'];
    for (let i = 0; i < PUBLIC_AGENT_REQUESTS_PER_IP; i++) {
      expect(guardPublicAgentRequest(request({ 'x-forwarded-for': `198.51.100.${i}, 203.0.113.1` }, paths[i % paths.length]))).toBeNull();
    }
    const rejected = guardPublicAgentRequest(request({ 'x-forwarded-for': '198.51.100.250, 203.0.113.1' }));
    expect(rejected?.status).toBe(429);
    expect(rejected?.headers.get('retry-after')).toBe('60');
    expect(guardPublicAgentRequest(request({ 'x-forwarded-for': '203.0.113.2' }))).toBeNull();
  });

  it('bounds total traffic even when clients rotate between admitted addresses', () => {
    for (let i = 0; i < PUBLIC_AGENT_REQUESTS_PER_WINDOW; i++) {
      expect(guardPublicAgentRequest(request({ 'x-forwarded-for': `203.0.113.${i % 20}` }))).toBeNull();
    }
    expect(guardPublicAgentRequest(request({ 'x-forwarded-for': '203.0.113.21' }))?.status).toBe(429);
  });

  it('caps distinct address memory while keeping existing clients usable, then resets', () => {
    for (let i = 0; i < PUBLIC_AGENT_MAX_TRACKED_IPS; i++) {
      expect(guardPublicAgentRequest(request({ 'x-forwarded-for': `2001:db8::${i.toString(16)}` }))).toBeNull();
    }
    const newAddress = request({ 'x-forwarded-for': '2001:db8:1::1' });
    expect(guardPublicAgentRequest(newAddress)?.status).toBe(429);
    expect(guardPublicAgentRequest(request({ 'x-forwarded-for': '2001:db8::1' }))).toBeNull();
    vi.advanceTimersByTime(59_001);
    expect(guardPublicAgentRequest(newAddress)?.headers.get('retry-after')).toBe('1');
    vi.advanceTimersByTime(999);
    expect(guardPublicAgentRequest(newAddress)).toBeNull();
  });

  it('maps malformed or missing addresses to one bounded unknown bucket', () => {
    for (let i = 0; i < PUBLIC_AGENT_REQUESTS_PER_IP; i++) {
      expect(guardPublicAgentRequest(request({ 'x-forwarded-for': `not-an-address-${i}` }))).toBeNull();
    }
    expect(guardPublicAgentRequest(request())?.status).toBe(429);
  });
});
