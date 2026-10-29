import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { getGuestDraftService } from '../guest-drafts';
import { getQuoteAssistService } from '../quote-assist';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';

beforeEach(async () => { await setupServerTestEnv(); });
afterEach(async () => { vi.unstubAllEnvs(); await teardownServerTestEnv(); });
async function draft() {
  const id = randomUUID();
  await (await getGuestDraftService()).savePublic({ id, revision: 0, answers: { websiteUrl: 'https://shop.example/' }, files: [],
    quoteContext: { ...newQuoteContext(), bizNo: '1248100998' } }, 'proof');
  return { id, revision: 1, kind: 'business' as const, input: '1248100998' };
}
it('같은 요청을 중복 선점하지 않고 결과를 24시간 재사용한다', async () => {
  const service = await getQuoteAssistService();
  const input = await draft();
  const claimed = await service.claim(input, 'proof', 'ip');
  expect(claimed.status).toBe('claimed');
  expect((await service.claim(input, 'proof', 'ip')).status).toBe('pending');
  const result = { status: 'partial' as const, suggestions: [], needsConfirmation: [] };
  await service.finish(input, 'proof', result);
  expect(await service.claim(input, 'proof', 'ip')).toMatchObject({ status: 'cached', result });
  await expect(service.claim(input, 'wrong', 'ip')).rejects.toThrow('GUEST_DRAFT_UNAVAILABLE');
  await expect(service.claim({ ...input, revision: 2 }, 'proof', 'ip')).rejects.toThrow('GUEST_DRAFT_CHANGED');
});
it('명시적인 재시도도 초안별 5회 한도를 공유하고 일반 저장을 막지 않는다', async () => {
  const service = await getQuoteAssistService();
  const input = await draft();
  for (let i = 0; i < 5; i++)
    expect((await service.claim({ ...input, retry: randomUUID() }, 'proof', 'ip')).status).toBe('claimed');
  expect((await service.claim({ ...input, retry: randomUUID() }, 'proof', 'ip')).status).toBe('limited');
  expect(await (await getGuestDraftService()).savePublic({ id: input.id, revision: 1, answers: { title: '직접 작성' }, files: [] }, 'proof')).toMatchObject({ revision: 2 });
});
it('IP 20회 한도는 다른 초안에도 적용하고 웹사이트 분석은 초안당 3회다', async () => {
  const service = await getQuoteAssistService();
  for (let i = 0; i < 4; i++) {
    const input = await draft();
    for (let j = 0; j < 5; j++) expect((await service.claim({ ...input, retry: randomUUID() }, 'proof', 'shared')).status).toBe('claimed');
  }
  const last = await draft();
  expect((await service.claim(last, 'proof', 'shared')).status).toBe('limited');
  const input = { ...last, kind: 'website' as const, input: 'https://shop.example/' };
  for (let i = 0; i < 3; i++) expect((await service.claim({ ...input, retry: randomUUID() }, 'proof', 'different')).status).toBe('claimed');
  expect((await service.claim({ ...input, retry: randomUUID() }, 'proof', 'different')).status).toBe('limited');
});
