import { test, expect, type Page } from 'playwright/test';

// 히어로 아래 점 격자 손전등·스크롤 레일(2026-11-24). 실제 레이아웃·옵저버로 확인한다.
// 픽셀 모양은 스크린샷 검수로 보고, 여기서는 회귀하기 쉬운 계약만 잡는다:
//  ① 띠 네 곳과 서비스 소개에만 깔린다 ② 쉬는 동안 캔버스가 비어 있다(호버에만 보임)
//  ③ 호버하면 드러났다가 다시 빈다 ④ 반응이 끝나면 루프가 멈춘다(유휴 중 다시 그리지 않음)
//  ⑤ 스크롤만으로는 드러나지 않는다 ⑥ 레일 노드가 읽은 만큼 켜진다 ⑦ 좁은 화면에서는 레일이 숨는다.

async function countLampDraws(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __lampDraws: number }).__lampDraws = 0;
    const orig = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...args: [number, number, number, number]) {
      if (this.canvas?.closest?.('[data-section-fx]')) {
        (window as unknown as { __lampDraws: number }).__lampDraws++;
      }
      return orig.apply(this, args);
    };
  });
}

const draws = (page: Page) => page.evaluate(() => (window as unknown as { __lampDraws: number }).__lampDraws);

/** 화면에 걸친 손전등 캔버스들의 알파 합 — 0 이면 아무것도 안 그려진 상태다. */
const inkOnScreen = (page: Page) => page.evaluate(() => {
  let sum = 0;
  for (const c of document.querySelectorAll<HTMLCanvasElement>('main [data-section-fx] canvas')) {
    if (c.width <= 1) continue;
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) sum += d[i];
  }
  return sum;
});

async function scrollInto(page: Page, selector: string, offset = 120) {
  await page.locator(selector).evaluate((el, dy) => {
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + dy, behavior: 'instant' });
  }, offset);
}

test.describe('landing section dot lamp and scroll rail', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`hidden at rest, shows only while hovering, then goes idle (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await countLampDraws(page);
      await page.goto('/');

      // The four neutral bands plus the service story carry a lamp.
      await expect(page.locator('main [data-section-fx]')).toHaveCount(5);
      await expect(page.locator('#service [data-section-fx], #process [data-section-fx], #pricing [data-section-fx], #faq [data-section-fx]')).toHaveCount(4);

      await scrollInto(page, '#faq', -40);
      // Park the pointer on the fixed header, outside every section.
      await page.mouse.move(720, 8);
      await page.waitForTimeout(1500);
      expect(await inkOnScreen(page)).toBe(0);
      const idle0 = await draws(page);
      await page.waitForTimeout(1500);
      expect(await draws(page)).toBe(idle0);

      // Hovering reveals dots, then they cool down to an empty canvas and the loop sleeps.
      await page.mouse.move(300, 300);
      await page.mouse.move(1100, 560, { steps: 20 });
      await expect.poll(() => inkOnScreen(page)).toBeGreaterThan(0);
      await page.mouse.move(720, 8);
      await expect.poll(() => inkOnScreen(page), { timeout: 5000 }).toBe(0);
      const afterHover = await draws(page);
      await page.waitForTimeout(1000);
      expect(await draws(page)).toBe(afterHover);

      // Scrolling under a resting pointer reveals nothing.
      await page.mouse.move(700, 450);
      await expect.poll(() => inkOnScreen(page), { timeout: 5000 }).toBe(0);
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(300);
      expect(await inkOnScreen(page)).toBe(0);
    });
  }

  test('the pinned service story reveals on hover too', async ({ page }) => {
    await page.goto('/');
    await scrollInto(page, '#service', 300);
    // The pinned section fills the whole viewport, so no pointer move here: the mouse has not moved yet.
    await page.waitForTimeout(800);
    expect(await inkOnScreen(page)).toBe(0);
    await page.mouse.move(250, 500);
    await page.mouse.move(1200, 700, { steps: 20 });
    await expect.poll(() => inkOnScreen(page)).toBeGreaterThan(0);
  });

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
    // A short last section never reaches the read line; the page end still completes the rail.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect.poll(active).toBe(await dots.count());
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(active).toBe(0);
  });

  for (const width of [1280, 1440]) {
    test(`rail stays left of every section's visible content at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const railX = await page.locator('[data-landing-scroll-rail]').evaluate((el) => el.getBoundingClientRect().right);
      const sections = await page.locator('main [data-rail-node]').count();
      for (let i = 0; i < sections; i++) {
        const section = page.locator('main [data-rail-node]').nth(i);
        await section.evaluate((el) => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top, behavior: 'instant' }));
        await page.waitForTimeout(300);
        const minLeft = await section.evaluate((el) => {
          let min = Infinity;
          for (const node of el.querySelectorAll('*')) {
            if (node.closest('[data-section-fx]')) continue;
            const r = node.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
            const cs = getComputedStyle(node);
            // Layout-only wrappers paint nothing; only boxes that draw something count.
            const paints = (node.childNodes.length > 0 && [...node.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim()))
              || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderLeftWidth !== '0px'
              || ['IMG', 'SVG', 'svg', 'CANVAS', 'INPUT', 'BUTTON'].includes(node.tagName);
            if (!paints || cs.visibility === 'hidden' || cs.opacity === '0') continue;
            min = Math.min(min, r.left);
          }
          return min;
        });
        expect(minLeft, `section ${i}`).toBeGreaterThan(railX);
      }
    });
  }

  test('rail is hidden on narrow screens while fields still render', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-landing-scroll-rail]')).toBeHidden();
    await expect(page.locator('main [data-section-fx]')).toHaveCount(5);
  });
});
