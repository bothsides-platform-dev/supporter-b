import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { getGuestDraftService } from '@/lib/server/services/guest-drafts';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) }));
import { POST } from '../route';
beforeEach(async () => { await setupServerTestEnv(); jar.set('support-b-guest-draft-proof', 'proof'); vi.stubGlobal('fetch', () => { throw new Error('AI prohibited'); }); });
afterEach(async () => { jar.clear(); vi.unstubAllGlobals(); await teardownServerTestEnv(); });
function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/guest-rfp/savings', { method: 'POST', headers: { origin, host: 'localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
it('금액이 부족해도 소유한 초안에는 산정 보류를 반환하고 공개 경계를 지킨다', async () => {
  const id = randomUUID();
  await (await getGuestDraftService()).savePublic({ id, revision: 0, answers: {}, files: [] }, 'proof');
  const response = await POST(request({ id, revision: 1 }));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ result: { status: 'unavailable' } });
  expect((await POST(request({ id, revision: 1, annualRevenue: -1 }))).status).toBe(400);
  expect((await POST(request({ id, revision: 1 }, 'https://evil.example'))).status).toBe(403);
  expect((await POST(request({ id, revision: 2 }))).status).toBe(409);
  jar.clear();
  expect((await POST(request({ id, revision: 1 }))).status).toBe(403);
});
