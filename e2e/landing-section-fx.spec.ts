import { test, expect, type Locator, type Page } from 'playwright/test';

// 히어로 아래 점 격자 손전등(2026-11-24, 구매사·PG 랜딩). 실제 레이아웃·옵저버로 확인한다.
// 픽셀 모양은 스크린샷 검수로 보고, 여기서는 회귀하기 쉬운 계약만 잡는다:
//  ① 히어로 아래 섹션마다 하나씩 깔린다 ② 쉬는 동안 캔버스가 비어 있다(호버에만 보임)
//  ③ 호버하면 드러났다가 다시 빈다 ④ 반응이 끝나면 루프가 멈춘다(유휴 중 다시 그리지 않음)
//  ⑤ 스크롤만으로는 드러나지 않는다 ⑥ 어느 섹션이든 호버하면 드러난다
//  ⑦ PG 랜딩의 반전 CTA(on-surface 바탕)는 반전 짝 색으로 그린다.

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

/** 섹션을 화면에 들이고, 화면에 걸친 부분의 가운데를 가로로 쓸어 지나간다. */
async function sweepOver(page: Page, section: Locator) {
  await section.evaluate((el) => {
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + 200, behavior: 'instant' });
  });
  await page.waitForTimeout(300);
  const box = await section.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.max(r.top, 80), bottom: Math.min(r.bottom, innerHeight) };
  });
  const y = Math.round((box.top + box.bottom) / 2);
  await page.mouse.move(200, y);
  await page.mouse.move(1240, y, { steps: 20 });
}

/** 문제 제기와 지표 섹션은 id 가 없다 — 섹션 순서로 찾는다. */
const LAMP_SECTIONS = ['problem', '#service', '#process', 'metrics', '#pricing', '#calculator', '#faq', '#consultation', '#contact'] as const;
const sectionLocator = (page: Page, key: (typeof LAMP_SECTIONS)[number]) =>
  key.startsWith('#')
    ? page.locator(key)
    : page.locator('main > section').nth(key === 'problem' ? 1 : 4);

test.describe('landing section dot lamp', () => {
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

      // Every section below the hero carries exactly one lamp.
      await expect(page.locator('main [data-section-fx]')).toHaveCount(LAMP_SECTIONS.length);
      for (const key of LAMP_SECTIONS) {
        await expect(sectionLocator(page, key).locator(':scope > [data-section-fx]'), key).toHaveCount(1);
      }

      // The mouse has not moved yet: nothing is drawn and the loop does not run.
      await scrollInto(page, '#faq', -40);
      await page.waitForTimeout(1500);
      expect(await inkOnScreen(page)).toBe(0);
      const idle0 = await draws(page);
      await page.waitForTimeout(1500);
      expect(await draws(page)).toBe(idle0);

      // Hovering reveals dots, then they cool down to an empty canvas and the loop sleeps.
      await page.mouse.move(300, 300);
      await page.mouse.move(1100, 560, { steps: 20 });
      await expect.poll(() => inkOnScreen(page)).toBeGreaterThan(0);
      await expect.poll(() => inkOnScreen(page), { timeout: 5000 }).toBe(0);
      const afterHover = await draws(page);
      await page.waitForTimeout(1000);
      expect(await draws(page)).toBe(afterHover);

      // Scrolling under the resting pointer (still over a lamp section) reveals nothing.
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(300);
      expect(await inkOnScreen(page)).toBe(0);
    });
  }

  test('every section reveals on hover', async ({ page }) => {
    await page.goto('/');
    for (const key of LAMP_SECTIONS) {
      await sweepOver(page, sectionLocator(page, key));
      await expect.poll(() => inkOnScreen(page), { message: key }).toBeGreaterThan(0);
      await expect.poll(() => inkOnScreen(page), { message: key, timeout: 5000 }).toBe(0);
    }
  });

  test('PG landing: every section below the hero reveals on hover; the inverted CTA draws light dots', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/pg-landing');
    // Hero, then problem · inbound · advantage · process · cases · faq · final CTA.
    const sections = page.locator('main > section');
    await expect(sections).toHaveCount(8);
    await expect(page.locator('main [data-section-fx]')).toHaveCount(7);
    for (let i = 1; i < 8; i++) {
      const section = sections.nth(i);
      await expect(section.locator(':scope > [data-section-fx]'), `section ${i}`).toHaveCount(1);
      await sweepOver(page, section);
      await expect.poll(() => inkOnScreen(page), { message: `section ${i}` }).toBeGreaterThan(0);
      if (i === 7) {
        // The CTA sits on on-surface (near black in light): dots use inverse-on-surface/inverse-primary, so they are light.
        const brightness = await section.locator(':scope > [data-section-fx] canvas').evaluate((c: HTMLCanvasElement) => {
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          let best = 3;
          for (let j = 3; j < d.length; j += 4) if (d[j] > d[best]) best = j;
          return (d[best - 3] + d[best - 2] + d[best - 1]) / 3;
        });
        expect(brightness).toBeGreaterThan(160);
      }
      await expect.poll(() => inkOnScreen(page), { message: `section ${i}`, timeout: 5000 }).toBe(0);
    }
  });
});
