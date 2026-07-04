import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleUserRepository } from '../user';
import { seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleUserRepository(db);
  return { db, repo };
}

describe('DrizzleUserRepository onboarding', () => {
  it('신규 유저는 getOnboarding이 {_v:1} 빈 문서를 반환한다', async () => {
    const { db, repo } = await setup();
    const { id } = await seedUser(db);

    const onboarding = await repo.getOnboarding(id);
    expect(onboarding).toEqual({ _v: 1 });
  });

  it('markOnboarding으로 completed 스탬프를 찍으면 getOnboarding에 반영된다', async () => {
    const { db, repo } = await setup();
    const { id } = await seedUser(db);

    await repo.markOnboarding(id, 'buyerSample', { completedAt: '2026-07-01T00:00:00.000Z' });

    const onboarding = await repo.getOnboarding(id);
    expect(onboarding).toEqual({
      _v: 1,
      buyerSample: { completedAt: '2026-07-01T00:00:00.000Z' },
    });
  });

  it('다른 키(pgSample)는 서로 덮어쓰지 않는다', async () => {
    const { db, repo } = await setup();
    const { id } = await seedUser(db);

    await repo.markOnboarding(id, 'buyerSample', { completedAt: '2026-07-01T00:00:00.000Z' });
    await repo.markOnboarding(id, 'pgSample', { dismissedAt: '2026-07-02T00:00:00.000Z' });

    const onboarding = await repo.getOnboarding(id);
    expect(onboarding).toEqual({
      _v: 1,
      buyerSample: { completedAt: '2026-07-01T00:00:00.000Z' },
      pgSample: { dismissedAt: '2026-07-02T00:00:00.000Z' },
    });
  });

  it('같은 키에 다시 markOnboarding하면 병합되고(멱등) completedAt 다음 dismissedAt도 함께 남는다', async () => {
    const { db, repo } = await setup();
    const { id } = await seedUser(db);

    await repo.markOnboarding(id, 'buyerSample', { completedAt: '2026-07-01T00:00:00.000Z' });
    await repo.markOnboarding(id, 'buyerSample', { dismissedAt: '2026-07-03T00:00:00.000Z' });

    const onboarding = await repo.getOnboarding(id);
    expect(onboarding.buyerSample).toEqual({
      completedAt: '2026-07-01T00:00:00.000Z',
      dismissedAt: '2026-07-03T00:00:00.000Z',
    });
  });

  it('동일 patch로 재호출해도 결과가 동일하다(idempotent)', async () => {
    const { db, repo } = await setup();
    const { id } = await seedUser(db);

    await repo.markOnboarding(id, 'buyerSample', { completedAt: '2026-07-01T00:00:00.000Z' });
    await repo.markOnboarding(id, 'buyerSample', { completedAt: '2026-07-01T00:00:00.000Z' });

    const onboarding = await repo.getOnboarding(id);
    expect(onboarding).toEqual({
      _v: 1,
      buyerSample: { completedAt: '2026-07-01T00:00:00.000Z' },
    });
  });
});
