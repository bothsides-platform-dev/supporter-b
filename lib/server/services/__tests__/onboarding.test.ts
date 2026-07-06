import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { OnboardingService } from '../onboarding';

let db: PgliteDB;
let svc: OnboardingService;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  svc = new OnboardingService(db);
});

afterEach(() => {
  __resetForTest();
});

describe('OnboardingService.mark', () => {
  it('stamps completedAt on the given key', async () => {
    const u = await seedUser(db);
    const res = await svc.mark({ userId: u.id }, 'buyerSample', 'completed');
    expect(res.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.buyerSample?.completedAt).toBeTruthy();
    expect(onboarding.buyerSample?.dismissedAt).toBeUndefined();
  });

  it('stamps dismissedAt on the given key', async () => {
    const u = await seedUser(db);
    const res = await svc.mark({ userId: u.id }, 'pgSample', 'dismissed');
    expect(res.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.pgSample?.dismissedAt).toBeTruthy();
  });

  it('is idempotent — marking the same key/event twice keeps a single stamp shape', async () => {
    const u = await seedUser(db);
    await svc.mark({ userId: u.id }, 'buyerSample', 'completed');
    const res2 = await svc.mark({ userId: u.id }, 'buyerSample', 'completed');
    expect(res2.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.buyerSample?.completedAt).toBeTruthy();
  });
});
