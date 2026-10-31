import { beforeEach, afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { getGuestDraftService } from '../guest-drafts';

beforeEach(setupServerTestEnv);
afterEach(teardownServerTestEnv);
it('선택적인 quoteContext를 증명과 revision에 묶어 복원하고 예전 초안도 읽는다', async () => {
  const service = await getGuestDraftService();
  const id = randomUUID();
  const quoteContext = { version: 1 as const, stage: 'questions' as const, bizNo: '1248100998',
    companyName: '노온', confirmed: ['website'], userFields: [], analysisState: 'manual' as const };
  const saved = await service.savePublic({ id, revision: 0, answers: { websiteUrl: 'https://example.com' }, files: [], quoteContext }, 'proof');
  expect(await service.readPublic(id, 'proof')).toMatchObject({ revision: saved.revision, quoteContext });
  await expect(service.readPublic(id, 'other')).rejects.toThrow('GUEST_DRAFT_UNAVAILABLE');
  await expect(service.savePublic({ id, revision: 0, answers: {}, files: [], quoteContext }, 'proof')).rejects.toThrow('GUEST_DRAFT_CHANGED');
  const legacy = randomUUID();
  await service.savePublic({ id: legacy, revision: 0, answers: {}, files: [] }, 'proof');
  expect((await service.readPublic(legacy, 'proof')).quoteContext).toBeUndefined();
});
