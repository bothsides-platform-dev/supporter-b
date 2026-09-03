import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  OnboardingService,
  __resetOnboardingServiceForTest,
  getOnboardingService,
} from '../onboarding';

let db: PgliteDB;
let svc: OnboardingService;

beforeEach(async () => {
  __resetForTest();
  __resetOnboardingServiceForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  svc = new OnboardingService(db);
});

afterEach(() => {
  __resetOnboardingServiceForTest();
  __resetForTest();
});

describe('getOnboardingService (builder)', () => {
  // 빌더는 db 를 리포 번들의 `getDb()` 에서 받는다 — 하네스가 서비스를 손으로
  // 조립하지 않아도 주입된 PGlite 로 쓰기가 실제로 들어가는지 본다.
  it('builds from the injected bundle db and writes through it', async () => {
    const u = await seedUser(db);

    const built = await getOnboardingService();
    expect(built).toBeInstanceOf(OnboardingService);
    const res = await built.mark({ userId: u.id }, 'buyerTutorial', 'completed');
    expect(res.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const onboarding = await new DrizzleUserRepository(db).getOnboarding(u.id);
    expect(onboarding.buyerTutorial?.completedAt).toBeTruthy();
  });
});

describe('OnboardingService.mark', () => {
  it('stamps completedAt on the given key', async () => {
    const u = await seedUser(db);
    const res = await svc.mark({ userId: u.id }, 'buyerTutorial', 'completed');
    expect(res.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.buyerTutorial?.completedAt).toBeTruthy();
    expect(onboarding.buyerTutorial?.dismissedAt).toBeUndefined();
  });

  it('stamps dismissedAt on the given key', async () => {
    const u = await seedUser(db);
    const res = await svc.mark({ userId: u.id }, 'pgTutorial', 'dismissed');
    expect(res.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.pgTutorial?.dismissedAt).toBeTruthy();
  });

  it('is idempotent — marking the same key/event twice keeps a single stamp shape', async () => {
    const u = await seedUser(db);
    await svc.mark({ userId: u.id }, 'buyerTutorial', 'completed');
    const res2 = await svc.mark({ userId: u.id }, 'buyerTutorial', 'completed');
    expect(res2.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.buyerTutorial?.completedAt).toBeTruthy();
  });
});
