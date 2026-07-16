/**
 * 첫 견적 코치마크(FirstRfpCoachmark) e2e — buyer 홈 CTA 단일 action step.
 *
 * 시드 buyer(yeonseong.dev@gmail.com)는 이미 RFP를 보유해 표시 게이트
 * (hasAnyRfp, lib/onboarding/visibility.ts)에 걸려 코치마크가 뜨지 않는다 —
 * 이 스펙 전용 RFP 0건 격리 buyer를 raw SQL로 직접 만든다(user + buyer
 * workspace(active) + membership). 비밀번호는 시드 buyer 행의 password_hash를
 * 그대로 복사해 동일 평문(password123)으로 로그인할 수 있게 한다.
 *
 * 검증 포인트:
 *   - 시나리오 1: 코치마크 표시 → CTA(data-coachmark="home-create-rfp") 실클릭
 *     → /rfp-create 도달 → users.onboarding.buyerFirstRfp.completedAt 스탬프
 *   - 시나리오 2: 건너뛰기 버튼 클릭 → dismissedAt 스탬프 → reload 후 미표시
 *     (서버 컴포넌트가 DB 스탬프를 읽어 표시 게이트를 다시 평가함을 확인)
 */
import { test, expect, type Page } from 'playwright/test';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const SEED_BUYER_EMAIL = 'yeonseong.dev@gmail.com';
const ISOLATED_EMAIL = 'coachmark-buyer@e2e.test';
const PASSWORD = 'password123';

type OnboardingRow = { onboarding: { buyerFirstRfp?: { completedAt?: string; dismissedAt?: string } } };

/** RFP 0건 격리 buyer를 멱등 생성한다. 이미 있으면 재사용하고 onboarding만
 *  리셋한다 — 시나리오 2가 시나리오 1의 completed 스탬프를 물려받지 않도록. */
async function ensureIsolatedBuyer(): Promise<void> {
  const existing = (await db.execute(
    sql`SELECT id FROM users WHERE email = ${ISOLATED_EMAIL}`,
  )) as unknown as Array<{ id: string }>;
  if (existing.length > 0) {
    await db.execute(
      sql`UPDATE users SET onboarding = '{}'::jsonb WHERE email = ${ISOLATED_EMAIL}`,
    );
    return;
  }

  const userId = randomUUID();
  const workspaceId = randomUUID();

  // password_hash는 시드 buyer 행에서 그대로 복사 — 동일 평문(password123)으로 로그인.
  await db.execute(sql`
    INSERT INTO users (id, email, password_hash, name, avatar_color, email_verified)
    SELECT ${userId}, ${ISOLATED_EMAIL}, password_hash, '코치마크 e2e buyer', 'accent', true
    FROM users WHERE email = ${SEED_BUYER_EMAIL}
  `);
  await db.execute(sql`
    INSERT INTO workspaces (id, type, name, status)
    VALUES (${workspaceId}, 'buyer', '코치마크 e2e 워크스페이스', 'active')
  `);
  await db.execute(sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (${workspaceId}, ${userId}, 'admin')
  `);
}

async function onboardingDoc(): Promise<OnboardingRow['onboarding']> {
  const rows = (await db.execute(
    sql`SELECT onboarding FROM users WHERE email = ${ISOLATED_EMAIL}`,
  )) as unknown as OnboardingRow[];
  return rows[0]?.onboarding ?? {};
}

async function loginIsolatedBuyer(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', ISOLATED_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
  // 이 스펙을 단독 실행하면 /login→/home 트리가 첫 히트라 cold-compile 여유가 필요하다
  // (기존 scenario 스펙의 loginAs 와 동일한 45s — e2e/_helpers.ts 참고).
  await page.waitForURL(/\/home$/, { timeout: 45_000 });
}

test.describe.serial('첫 견적 코치마크', () => {
  // /home 최초 히트 + /rfp-create cold-compile 을 함께 커버 — scenario-b/e 와 동일하게
  // 90s 로 넉넉히 잡는다(기본 30s 전역 타임아웃은 단독 실행 시 빠듯하다).
  test.setTimeout(90_000);

  test('CTA 실클릭 → /rfp-create 도달 → completed 스탬프', async ({ page }) => {
    await ensureIsolatedBuyer();
    await loginIsolatedBuyer(page);

    await page
      .locator('[data-slot="coachmark-ring"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByText('견적 요청을 시작해요')).toBeVisible();

    await page.locator('[data-coachmark="home-create-rfp"]').click();
    await page.waitForURL(/\/rfp-create$/, { timeout: 15_000 });

    await expect
      .poll(async () => (await onboardingDoc()).buyerFirstRfp?.completedAt, {
        timeout: 10_000,
      })
      .toBeTruthy();
  });

  test('건너뛰기 클릭 → dismissed 스탬프 → reload 후 미표시', async ({ page }) => {
    await ensureIsolatedBuyer();
    await loginIsolatedBuyer(page);

    await page
      .locator('[data-slot="coachmark-ring"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('[role="dialog"]').getByRole('button', { name: '건너뛰기' }).click();

    await expect
      .poll(async () => (await onboardingDoc()).buyerFirstRfp?.dismissedAt, {
        timeout: 10_000,
      })
      .toBeTruthy();

    // 서버 컴포넌트가 DB 스탬프를 다시 읽어 표시 게이트를 재평가하는지 확인.
    await page.reload();
    await expect(page.locator('[data-slot="coachmark-ring"]')).toHaveCount(0);
  });
});
