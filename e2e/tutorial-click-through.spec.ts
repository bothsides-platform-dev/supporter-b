/**
 * 온보딩 튜토리얼 클릭-스루 여정 — buyer + pg.
 *
 * 실제 CoachmarkTour(클릭-스루 스포트라이트) + 실제 위저드(RfpCreateWizard/
 * BidWizard)를 fixture 시드로 구동해, 사용자가 아무것도 입력하지 않고
 * 코치마크가 뚫어준 구멍의 실제 버튼만 클릭해 처음부터 끝까지 완주하는지
 * 검증한다. 단위 테스트는 투어/위저드를 서로 mock하므로 이 조합은 여기서만
 * 실부품으로 커버된다(pre-landing review 지적 사항).
 *
 * 검증 포인트:
 *   - buyer: 위저드 1→4 다음 버튼 → 제출 → 도착 CTA → 선정 → 완료 화면
 *   - pg: 초대 CTA → 조건 확인 → BidWizard 1→4 → 견적 보내기 → 확인 → 완료 화면
 *   - 키보드 락: 프리필 입력에 타이핑해도 값 불변 (편집 요소만 차단)
 *   - 완료 시 users.onboarding 에 completed 스탬프
 */
import { test, expect, type Page } from 'playwright/test';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { loginAs, type Role } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const EMAILS: Record<'buyer' | 'pg-toss', string> = {
  buyer: 'yeonseong.dev@gmail.com',
  'pg-toss': 'ws-toss-admin@example.com',
};

/** /tutorial 은 완료 스탬프가 있으면 /home 으로 돌려보낸다 — 각 여정 전 초기화. */
async function resetOnboarding(email: string): Promise<void> {
  await db.execute(sql`UPDATE users SET onboarding = '{}'::jsonb WHERE email = ${email}`);
}

async function onboardingDoc(email: string): Promise<Record<string, unknown>> {
  const rows = (await db.execute(
    sql`SELECT onboarding FROM users WHERE email = ${email}`,
  )) as unknown as Array<{ onboarding: Record<string, unknown> }>;
  return rows[0]?.onboarding ?? {};
}

/** 코치마크가 해당 타깃을 가리킬 때(링 표시) 실제 버튼을 클릭한다. */
async function clickThrough(page: Page, target: string): Promise<void> {
  const el = page.locator(`[data-coachmark="${target}"]`);
  await el.waitFor({ state: 'visible', timeout: 15_000 });
  await page
    .locator('[data-slot="coachmark-ring"]')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await el.click();
}

/** info 말풍선(읽고 다음 모델)을 닫는다. */
async function dismissInfo(page: Page): Promise<void> {
  const next = page.locator('[role="dialog"]').getByRole('button', { name: /^(다음|확인)$/ });
  await next.waitFor({ state: 'visible', timeout: 15_000 });
  await next.click();
}

async function enterTutorial(page: Page, role: Role): Promise<void> {
  await loginAs(page, role);
  await page.goto('/tutorial');
  await page.waitForURL(/\/tutorial$/, { timeout: 30_000 });
}

test.describe.serial('온보딩 튜토리얼 — 클릭-스루 여정', () => {
  test('buyer: 무입력 클릭만으로 작성→제출→도착→선정→완료', async ({ page }) => {
    await resetOnboarding(EMAILS.buyer);
    await enterTutorial(page, 'buyer');

    // 인트로(info) → 위저드 1~3단계 다음 버튼 클릭-스루.
    await dismissInfo(page);
    await clickThrough(page, 'tutorial-wizard-next-1');

    // 키보드 락: 2단계 제목 입력은 프리필돼 있고 타이핑해도 값이 안 바뀐다.
    const title = page.locator('input').first();
    await title.waitFor({ state: 'visible' });
    const before = await title.inputValue();
    expect(before).not.toBe('');
    await title.click({ force: true });
    await page.keyboard.type('해킹');
    await page.keyboard.press('Backspace');
    expect(await title.inputValue()).toBe(before);

    await clickThrough(page, 'tutorial-wizard-next-2');
    await clickThrough(page, 'tutorial-wizard-next-3');
    await clickThrough(page, 'tutorial-wizard-submit');

    // 도착 연출(스태거 ~1.8s) 후 CTA → 비교 화면 info → 선정.
    await clickThrough(page, 'tutorial-arrival-cta');
    await dismissInfo(page);
    await clickThrough(page, 'tutorial-award-cta');

    await expect(page.getByText('튜토리얼을 완료했어요')).toBeVisible({ timeout: 15_000 });

    // completed 스탬프 — 홈 환영 모달/재유도 배너가 더는 뜨지 않는 근거.
    await expect
      .poll(async () => {
        const doc = await onboardingDoc(EMAILS.buyer);
        return (doc as { buyerTutorial?: { completedAt?: string } }).buyerTutorial?.completedAt;
      }, { timeout: 10_000 })
      .toBeTruthy();
  });

  test('pg: 무입력 클릭만으로 초대→조건→작성→제출→완료', async ({ page }) => {
    await resetOnboarding(EMAILS['pg-toss']);
    await enterTutorial(page, 'pg-toss');

    await clickThrough(page, 'tutorial-invite-cta');
    await dismissInfo(page); // 조건 패널 info
    await clickThrough(page, 'tutorial-brief-cta');
    await dismissInfo(page); // 견적 폼 info

    // 프리필 확인: 정산주기 D+2 시드가 채워져 있다.
    await expect(page.locator('input[value="2"]').first()).toBeVisible();

    await clickThrough(page, 'tutorial-bid-next-1');
    await clickThrough(page, 'tutorial-bid-next-2');
    await clickThrough(page, 'tutorial-bid-next-3');
    await clickThrough(page, 'tutorial-bid-submit');

    // 제출 확인 다이얼로그(투어는 이미 종료·언마운트) → 확정.
    await page
      .getByRole('button', { name: '견적 보내기' })
      .last()
      .click();

    await expect(page.getByText('튜토리얼을 완료했어요')).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => {
        const doc = await onboardingDoc(EMAILS['pg-toss']);
        return (doc as { pgTutorial?: { completedAt?: string } }).pgTutorial?.completedAt;
      }, { timeout: 10_000 })
      .toBeTruthy();
  });
});
