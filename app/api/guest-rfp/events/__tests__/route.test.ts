import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn(async (_event: unknown) => {}));
vi.mock('@/lib/server/services/guest-rfp', () => ({ recordGuestEvent: send }));
import { POST } from '../route';
import { createGuestEventLimiter } from '@/lib/server/guest-rfp/request';
beforeEach(() => {
  send.mockClear();
  vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'https://support-b.com');
  vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.support-b.com');
});
afterEach(() => vi.unstubAllEnvs());
const valid = {
  draftId: '10000000-0000-4000-8000-000000000001',
  event: 'started',
  website: 'https://example.com',
  attachmentCount: 0,
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://support-b.com/api/guest-rfp/events', {
    method: 'POST',
    headers: {
      origin: 'https://support-b.com',
      host: 'support-b.com',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
it('accepts the configured buyer origin behind TLS proxy despite the internal Next URL', async () => {
  const proxied = (origin: string, host = 'support-b.com') => new Request('https://localhost:3000/api/guest-rfp/events', {
    method: 'POST',
    headers: { origin, host, 'x-forwarded-host': 'support-b.com', 'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-forwarded-for': 'proxy-fixture' },
    body: JSON.stringify(valid),
  });
  expect((await POST(proxied('https://support-b.com'))).status).toBe(204);
  expect((await POST(proxied('https://evil.com'))).status).toBe(403);
  expect((await POST(proxied('https://partner.support-b.com', 'partner.support-b.com'))).status).toBe(403);
  expect((await POST(proxied('https://support-b.com', 'evil.com'))).status).toBe(403);
  expect((await POST(proxied('https://localhost:3000'))).status).toBe(403);
});
it('validates the event and refuses cross-origin, excess fields and oversized chunked bodies', async () => {
  expect((await POST(request(valid))).status).toBe(204);
  expect(
    (await POST(request(valid, { origin: 'https://evil.com' }))).status,
  ).toBe(403);
  expect((await POST(request({ ...valid, memo: 'private' }))).status).toBe(400);
  expect((await POST(request({ ...valid, website: 'bad' }))).status).toBe(400);
  expect(
    (await POST(request({ ...valid, title: 'a'.repeat(9000) }))).status,
  ).toBe(413);
  expect((await POST(request({ ...valid, website: '   ' }))).status).toBe(400);
  expect(send).toHaveBeenCalledTimes(1);
});
it('rejects completed summaries lacking completion fields', async () => {
  expect((await POST(request({ ...valid, event: 'completed' }))).status).toBe(
    400,
  );
});
it('Slack/service outage is non-blocking for writing and authentication', async () => {
  send.mockRejectedValueOnce(new Error('offline'));
  expect((await POST(request(valid))).status).toBe(204);
});
it('limits IPs and global load with bounded windows', () => {
  const allow = createGuestEventLimiter();
  for (let n = 0; n < 10; n++) expect(allow('one', 0)).toBe(true);
  expect(allow('one', 0)).toBe(false);
  for (let n = 0; n < 50; n++) expect(allow(String(n), 0)).toBe(true);
  expect(allow('new', 0)).toBe(false);
  expect(allow('one', 60001)).toBe(true);
});
