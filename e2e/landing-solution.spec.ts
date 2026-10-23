import { test, expect } from 'playwright/test';

test.setTimeout(90_000);
for (const [width, height] of [[1440, 900], [1280, 720], [768, 1024], [390, 844], [320, 568]]) {
  for (const theme of ['light', 'dark']) {
    test(`solution ${width}x${height} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
      await page.goto('/');
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
      await page.locator('#service').evaluate(el => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top, behavior: 'instant' }));
      const section = page.locator('#service');
      const buttons = section.getByRole('button');
      const content = section.locator('[data-pinned] > div > div');
      const initialHeight = await content.evaluate(el => el.getBoundingClientRect().height);
      await expect(buttons).toHaveCount(4);
      await expect(section.getByRole('columnheader')).toHaveCount(7);
      for (const [step, columns] of [[0, ['수수료']], [1, ['정산주기', '보증보험', '가입비', '승인 상태']], [2, ['협의 가능 여부']], [3, []]] as const) {
        await buttons.nth(step).focus();
        await page.keyboard.press(step % 2 ? 'Space' : 'Enter');
        await expect(buttons.nth(step)).toHaveAttribute('aria-pressed', 'true');
        await expect(section.locator('th[data-active="true"]')).toHaveText([...columns]);
        expect(await content.evaluate(el => el.getBoundingClientRect().height)).toBe(initialHeight);
      }
      const scroll = section.getByTestId('offer-table-scroll-container');
      await buttons.nth(2).click();
      await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => scroll.evaluate(el => {
        const target = el.querySelectorAll('th')[6].getBoundingClientRect();
        const fixed = el.querySelector('th')!.getBoundingClientRect();
        return target.left >= fixed.right - 2 && target.right <= el.getBoundingClientRect().right + 2;
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const pin = section.locator('[data-pinned]');
      if (await pin.getAttribute('data-pinned') === 'true') {
        await pin.evaluate(el => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + (el.clientHeight - innerHeight) * 0.1, behavior: 'instant' }));
        await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');
      }
      await buttons.nth(0).click();
      await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => scroll.evaluate(el => {
        const fee = el.querySelectorAll('th')[1].getBoundingClientRect();
        const fixed = el.querySelector('th')!.getBoundingClientRect();
        return fee.left >= fixed.right - 2 && fee.right <= el.getBoundingClientRect().right + 2;
      })).toBe(true);
      await page.waitForTimeout(400);
      await page.screenshot({ path: info.outputPath('solution.png') });
      if (await pin.getAttribute('data-pinned') === 'false') {
        await section.getByRole('table').scrollIntoViewIfNeeded();
        await expect(scroll.locator('..').locator('..')).toHaveCSS('opacity', '1');
        await page.screenshot({ path: info.outputPath('solution-table.png') });
      }
      if (width === 1440) {
        await expect(pin).toHaveAttribute('data-pinned', 'true');
        await page.setViewportSize({ width: 320, height: 568 });
        await expect(pin).toHaveAttribute('data-pinned', 'false');
        await buttons.nth(3).click();
        await expect(buttons.nth(3)).toHaveAttribute('aria-pressed', 'true');
        await page.setViewportSize({ width, height });
        await expect(pin).toHaveAttribute('data-pinned', 'true');
      }
    });
  }
}
