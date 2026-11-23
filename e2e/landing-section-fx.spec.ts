import { test, expect, type Page } from 'playwright/test';

// 히어로 아래 라인 필드·스크롤 레일(2026-11-24). 실제 레이아웃·옵저버로 확인한다.
// 픽셀 모양은 스크린샷 검수로 보고, 여기서는 회귀하기 쉬운 계약만 잡는다:
//  ① 띠 네 곳에만 필드가 깔린다 ② 반응이 끝나면 루프가 멈춘다(유휴 중 다시 그리지 않음)
//  ③ 포인터·스크롤에 반응한다 ④ 레일 노드가 읽은 만큼 켜진다 ⑤ 좁은 화면에서는 레일이 숨는다.

async function countLineDraws(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __lineDraws: number }).__lineDraws = 0;
    const orig = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...args: [number, number, number, number]) {
      if (this.canvas?.closest?.('[data-section-line-field]')) {
        (window as unknown as { __lineDraws: number }).__lineDraws++;
      }
      return orig.apply(this, args);
    };
  });
}

const draws = (page: Page) => page.evaluate(() => (window as unknown as { __lineDraws: number }).__lineDraws);

async function scrollInto(page: Page, selector: string, offset = 120) {
  await page.locator(selector).evaluate((el, dy) => {
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + dy, behavior: 'instant' });
  }, offset);
}

test.describe('landing section line field and scroll rail', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`reacts to pointer and scroll, then goes idle (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await countLineDraws(page);
      await page.goto('/');

      // Only the four neutral bands carry a field.
      await expect(page.locator('main [data-section-line-field]')).toHaveCount(4);
      await expect(page.locator('#process [data-section-line-field], #pricing [data-section-line-field], #faq [data-section-line-field]')).toHaveCount(3);

      await scrollInto(page, '#faq');
      await page.mouse.move(5, 895);
      // Settle, then the loop must stay asleep.
      await page.waitForTimeout(1500);
      const idle0 = await draws(page);
      await page.waitForTimeout(1500);
      expect(await draws(page)).toBe(idle0);

      // Pointer wakes it, and it falls asleep again once the trail has cooled.
      await page.mouse.move(400, 400);
      await page.mouse.move(1100, 520, { steps: 20 });
      await expect.poll(() => draws(page)).toBeGreaterThan(idle0);
      await page.waitForTimeout(2500);
      const afterPointer = await draws(page);
      await page.waitForTimeout(1000);
      expect(await draws(page)).toBe(afterPointer);

      // Scrolling wakes it too (packets follow the scroll).
      await page.mouse.wheel(0, 120);
      await expect.poll(() => draws(page)).toBeGreaterThan(afterPointer);
    });
  }

  test('rail nodes light up as the reader moves down', async ({ page }) => {
    await page.goto('/');
    const rail = page.locator('[data-landing-scroll-rail]');
    await expect(rail).toBeVisible();
    const dots = rail.locator('[data-rail-dot]');
    await expect(dots).toHaveCount(await page.locator('main [data-rail-node]').count());

    const active = () => rail.locator('[data-rail-dot][data-active="true"]').count();
    await scrollInto(page, '#process', 200);
    await expect.poll(active).toBeGreaterThanOrEqual(3);
    const mid = await active();
    await scrollInto(page, '#faq', 200);
    await expect.poll(active).toBeGreaterThan(mid);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(active).toBe(0);
  });

  test('rail is hidden on narrow screens while fields still render', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-landing-scroll-rail]')).toBeHidden();
    await expect(page.locator('main [data-section-line-field]')).toHaveCount(4);
  });
});
