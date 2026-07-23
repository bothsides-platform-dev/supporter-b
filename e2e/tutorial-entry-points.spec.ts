/**
 * 온보딩 진입면(환영 모달·재유도 배너·이탈 가드) 여정 — TODOS 항목 6 (진입면 e2e).
 * 본여정(코치마크 클릭-스루)은 tutorial-click-through.spec.ts 가 커버 — 여기는
 * 튜토리얼 "밖"의 진입·이탈 면만 다룬다.
 *
 * 검증 포인트:
 *   ① 첫 홈 진입 → 환영 모달 → 체험 시작하기 → /tutorial 도달 (시작만으론 무스탬프)
 *   ② 나중에 하기 → dismissedAt 스탬프 + 모달 닫힘 → 리로드 → 재유도 배너 → 재진입
 *   ③ completed 상태 → 홈에서 모달·배너 부재 + /tutorial 직행이 /home 으로 바운스
 *   ④ 이탈 가드 3버튼(pg variant — pgTutorial 키): 계속 체험하기=잔류·무스탬프 /
 *      나중에 하기=dismissed+이동 / 건너뛰기=completed+이동
 *
 * 셀렉터 주의: '건너뛰기'는 코치마크 오버레이에도 있다 — 이탈 가드 상호작용은
 * 반드시 '튜토리얼을 나갈까요?' 다이얼로그로 스코프한다.
 */
import { test, expect } from 'playwright/test';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { emailFor, enterTutorial, loginAs, onboardingDoc, resetOnboarding } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const BUYER = emailFor('buyer');
const PG = emailFor('pg-toss');

test.describe.serial('온보딩 진입면 — 환영 모달·재유도 배너·이탈 가드', () => {
  test('buyer: 환영 모달 → 체험 시작하기 → /tutorial (시작만으론 무스탬프)', async ({ page }) => {
    await resetOnboarding(BUYER);
    await loginAs(page, 'buyer');

    await expect(page.getByText('서포트 B에 오신 걸 환영해요')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '체험 시작하기' }).click();
    await page.waitForURL(/\/tutorial$/, { timeout: 30_000 });

    // 체험 시작만으론 스탬프가 없다 — dismissed/completed 는 이탈·완주 시점에 찍힌다.
    const doc = (await onboardingDoc(BUYER)) as { buyerTutorial?: object };
    expect(doc.buyerTutorial ?? {}).toEqual({});
  });

  test('buyer: 나중에 하기 → dismissed 스탬프 → 재유도 배너 → 재진입', async ({ page }) => {
    await resetOnboarding(BUYER);
    await loginAs(page, 'buyer');

    await expect(page.getByText('서포트 B에 오신 걸 환영해요')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '나중에 하기' }).click();
    await expect(page.getByText('서포트 B에 오신 걸 환영해요')).not.toBeVisible();

    await expect
      .poll(
        async () =>
          ((await onboardingDoc(BUYER)) as { buyerTutorial?: { dismissedAt?: string } })
            .buyerTutorial?.dismissedAt,
        { timeout: 10_000 },
      )
      .toBeTruthy();

    // 리로드하면 모달 대신 재유도 배너가 뜨고, 배너로 재진입할 수 있다.
    await page.reload();
    const nudge = page.getByRole('link', { name: /3분 만에 서비스를 둘러보세요/ });
    await expect(nudge).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('서포트 B에 오신 걸 환영해요')).not.toBeVisible();
    await nudge.click();
    await page.waitForURL(/\/tutorial$/, { timeout: 30_000 });
  });

  test('buyer: 완료 상태 — 홈에 모달·배너 부재 + /tutorial 직행은 /home 으로 바운스', async ({ page }) => {
    // 정상 완주는 tutorial-click-through 가 커버 — 여기선 완료 상태를 직접 시드해
    // 진입면(부재·바운스)만 본다.
    await db.execute(sql`
      UPDATE users
      SET onboarding = jsonb_build_object(
        'buyerTutorial', jsonb_build_object('completedAt', now()::text)
      )
      WHERE email = ${BUYER}
    `);
    await loginAs(page, 'buyer');

    await expect(page.getByText('서포트 B에 오신 걸 환영해요')).not.toBeVisible();
    await expect(
      page.getByRole('link', { name: /3분 만에 서비스를 둘러보세요/ }),
    ).not.toBeVisible();

    await page.goto('/tutorial');
    await page.waitForURL(/\/home$/, { timeout: 30_000 });
  });

  test('pg: 이탈 가드 3버튼 — 계속 체험하기(잔류)·나중에 하기(dismissed)·건너뛰기(completed)', async ({
    page,
  }) => {
    await resetOnboarding(PG);
    await enterTutorial(page, 'pg-toss');

    const guardDialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: '튜토리얼을 나갈까요?' });
    const sidebarLink = () => page.locator('a[href="/inbox"]').first();

    // (1) 계속 체험하기 → 잔류 + 무스탬프.
    await sidebarLink().click();
    await expect(guardDialog).toBeVisible({ timeout: 15_000 });
    await guardDialog.getByRole('button', { name: '계속 체험하기' }).click();
    await expect(guardDialog).not.toBeVisible();
    expect(page.url()).toMatch(/\/tutorial$/);
    const afterStay = (await onboardingDoc(PG)) as { pgTutorial?: object };
    expect(afterStay.pgTutorial ?? {}).toEqual({});

    // (2) 나중에 하기 → dismissed 스탬프 + 목적지 이동 (stamp-then-move).
    await sidebarLink().click();
    await expect(guardDialog).toBeVisible({ timeout: 15_000 });
    await guardDialog.getByRole('button', { name: '나중에 하기' }).click();
    await page.waitForURL(/\/inbox$/, { timeout: 30_000 });
    await expect
      .poll(
        async () =>
          ((await onboardingDoc(PG)) as { pgTutorial?: { dismissedAt?: string } }).pgTutorial
            ?.dismissedAt,
        { timeout: 10_000 },
      )
      .toBeTruthy();

    // (3) dismissed 만으론 /tutorial 재진입이 가능하다 — 재진입 후 건너뛰기 →
    //     completed 스탬프 + 이동.
    await page.goto('/tutorial');
    await page.waitForURL(/\/tutorial$/, { timeout: 30_000 });
    await sidebarLink().click();
    await expect(guardDialog).toBeVisible({ timeout: 15_000 });
    await guardDialog.getByRole('button', { name: '건너뛰기' }).click();
    await page.waitForURL(/\/inbox$/, { timeout: 30_000 });
    await expect
      .poll(
        async () =>
          ((await onboardingDoc(PG)) as { pgTutorial?: { completedAt?: string } }).pgTutorial
            ?.completedAt,
        { timeout: 10_000 },
      )
      .toBeTruthy();
  });
});
