import { test, expect } from 'playwright/test';

for (const [width, height] of [[1440, 900], [1280, 720], [768, 1024], [390, 844], [320, 568]]) {
  for (const theme of ['light', 'dark']) {
    test(`solution ${width}x${height} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
      await page.goto('/');
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
      const section = page.locator('#service');
      const points = section.locator('li');
      await expect(points).toHaveCount(4);
      await expect(section.getByRole('button')).toHaveCount(0);
      await expect(section.getByRole('columnheader')).toHaveCount(7);
      // The existing sticky frame is inside the scroll track. Visit each segment,
      // then reverse to the first segment to verify both directions remain linked.
      const track = section.locator('.sticky').locator('..');
      for (const step of [0, 1, 2, 3, 0]) {
        await track.evaluate((el, step) => window.scrollTo({
          top: window.scrollY + el.getBoundingClientRect().top + (el.clientHeight - innerHeight) * ((step + 0.5) / 4),
          behavior: 'instant',
        }), step);
        await expect(points.nth(step)).toHaveAttribute('data-active', 'true');
        await expect(section.locator('th[data-active="true"]')).toHaveText(
          [['수수료'], ['정산주기', '보증보험', '가입비', '승인 상태'], ['협의 가능 여부'], []][step],
        );
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(section.getByRole('table').locator('..').locator('..').locator('..')).toHaveCSS('opacity', '1');
      await page.waitForTimeout(400);
      await page.screenshot({ path: info.outputPath('solution.png') });
    });
  }
}
