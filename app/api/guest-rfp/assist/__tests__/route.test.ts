import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { getGuestDraftService } from '@/lib/server/services/guest-drafts';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) }));
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));
import { POST } from '../route';
beforeEach(async () => {
  await setupServerTestEnv(); jar.set('support-b-guest-draft-proof', 'proof');
  vi.stubEnv('APICK_API_KEY', 'key');
});
afterEach(async () => { jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await teardownServerTestEnv(); });
function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/guest-rfp/assist', { method: 'POST',
    headers: { origin, host: 'localhost:3000', 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
    body: JSON.stringify(body) });
}
async function draft() {
  const id = randomUUID();
  await (await getGuestDraftService()).savePublic({ id, revision: 0, answers: { websiteUrl: 'https://shop.example.com/' }, files: [], quoteContext: newQuoteContext() }, 'proof');
  return { id, revision: 1, kind: 'website', input: 'https://shop.example.com/' };
}
it('AI 잔액 부족에도 규칙 기반 상품을 반환하고 같은 요청은 다시 과금하지 않는다', async () => {
  const fetcher = vi.fn(async (url: string | URL) => String(url).includes('apick.app')
    ? new Response(null, { status: 402 })
    : new Response('<script type="application/ld+json">{"@type":"Product","name":"면 티셔츠"}</script>', { headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  const input = await draft();
  const first = await POST(request(input));
  expect(first.status).toBe(200);
  const body = await first.json();
  expect(body).toMatchObject({ status: 'partial', suggestions: [{ field: 'mainProducts', value: '면 티셔츠' }] });
  expect(await (await POST(request(input))).json()).toEqual(body);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('AI 키가 없어도 홈페이지 추출을 수행하며 실패하면 직접 작성 상태로 반환한다', async () => {
  vi.stubEnv('APICK_API_KEY', '');
  vi.stubGlobal('fetch', async () => { throw new Error('site unavailable'); });
  expect(await (await POST(request(await draft()))).json()).toMatchObject({ status: 'manual', suggestions: [] });
});
it('다른 origin·증명·revision·입력으로 유료 호출을 하지 않는다', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const input = await draft();
  expect((await POST(request(input, 'https://evil.example'))).status).toBe(403);
  expect((await POST(request({ ...input, revision: 2 }))).status).toBe(409);
  expect((await POST(request({ ...input, input: 'https://other.example.com/' }))).status).toBe(409);
  jar.clear();
  expect((await POST(request(input))).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
