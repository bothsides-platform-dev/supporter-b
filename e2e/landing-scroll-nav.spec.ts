import { test, expect, type Page } from 'playwright/test';

const nav = (page: Page) => page.locator('header').first().getByRole('navigation');
const link = (page: Page, href: string) => nav(page).locator(`a[href="#${href}"]:visible`);

async function scrollToSection(page: Page, id: string) {
  await page.locator(`#${id}`).evaluate(el => {
    const header = document.querySelector('header')!.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - header.bottom, behavior: 'instant' });
  });
}

// Real layout + real observers: no stubs for scrolling, history, or section size.
test.describe('buyer landing current menu', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
  });

  test('scroll changes selection without history writes; hash anchors keep header clearance', async ({ page }, info) => {
    await page.goto('/');
    await expect(nav(page).locator('[aria-current]')).toHaveCount(0);
    const pricing = link(page, 'pricing');
    const originalSize = await pricing.boundingBox();
    const historyLength = await page.evaluate(() => history.length);
    await scrollToSection(page, 'service');
    const service = nav(page).getByRole('button', { name: '서비스 설명' });
    await expect(service).toHaveAttribute('aria-current', 'location');
    await service.click();
    await expect(link(page, 'service')).toHaveAttribute('aria-current', 'location');
    await page.keyboard.press('Escape');
    await scrollToSection(page, 'process');
    await expect(nav(page).locator('[aria-current]')).toHaveCount(0);
    await scrollToSection(page, 'pricing');
    await expect(pricing).toHaveAttribute('aria-current', 'location');
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    const activeSize = await pricing.boundingBox();
    expect(activeSize?.width).toBe(originalSize?.width);
    expect(activeSize?.height).toBe(originalSize?.height);
    await expect(pricing).toHaveCSS('text-decoration-line', 'underline');
    await expect(pricing).toHaveCSS('text-decoration-thickness', '1px');
    const primary = await pricing.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--md-sys-color-primary)';
      el.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(pricing).toHaveCSS('color', primary);
    await page.locator('header').first().screenshot({ path: info.outputPath('desktop-active.png') });

    await link(page, 'faq').click();
    await expect(page).toHaveURL(/#faq$/);
    await expect(link(page, 'faq')).toHaveAttribute('aria-current', 'location');
    await expect.poll(() => page.locator('#faq').evaluate(el => Math.abs(el.getBoundingClientRect().top - document.querySelector('header')!.getBoundingClientRect().bottom))).toBeLessThan(2);
    const heading = await page.locator('#faq h2').boundingBox();
    const header = await page.locator('header').first().boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    await scrollToSection(page, 'calculator');
    await expect(link(page, 'calculator')).toHaveAttribute('aria-current', 'location');
    await expect(link(page, 'faq')).not.toHaveAttribute('aria-current');
    await expect(page).toHaveURL(/#faq$/);
    await scrollToSection(page, 'consultation');
    await expect(nav(page).locator('[aria-current]')).toHaveCount(0);
  });

  test('scrolling upward through an exact section end restores its highlight', async ({ page }) => {
    await page.goto('/');
    await scrollToSection(page, 'service');
    const service = nav(page).getByRole('button', { name: '서비스 설명' });
    await expect(service).toHaveAttribute('aria-current', 'location');
    await page.locator('#service').evaluate(el => {
      const line = document.querySelector('header')!.getBoundingClientRect().bottom + 24;
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().bottom - line + 5, behavior: 'instant' });
    });
    await expect(service).not.toHaveAttribute('aria-current');
    // The real observer sees edge adjacency before the next upward scroll.
    await page.evaluate(() => window.scrollBy({ top: -5, behavior: 'instant' }));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(() => window.scrollBy({ top: -10, behavior: 'instant' }));
    await expect(service).toHaveAttribute('aria-current', 'location');
  });

  test('direct hash and browser back restore the selection from actual layout', async ({ page }) => {
    await page.goto('/#faq');
    await expect(link(page, 'faq')).toHaveAttribute('aria-current', 'location');
    await link(page, 'pricing').click();
    await expect(link(page, 'pricing')).toHaveAttribute('aria-current', 'location');
    await expect(page).toHaveURL(/#pricing$/);
    await page.goBack();
    await expect(page).toHaveURL(/#faq$/);
    await expect(link(page, 'faq')).toHaveAttribute('aria-current', 'location');
  });

  test('short contact is selected at the page end and cleared when leaving it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto('/');
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(link(page, 'contact')).toHaveAttribute('aria-current', 'location');
    const top = await page.locator('#contact').evaluate(el => el.getBoundingClientRect().top);
    const headerBottom = await page.locator('header').first().evaluate(el => el.getBoundingClientRect().bottom);
    expect(top).toBeGreaterThan(headerBottom + 24);
    await page.evaluate(() => window.scrollBy({ top: -20, behavior: 'instant' }));
    await expect(link(page, 'contact')).not.toHaveAttribute('aria-current');
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('mobile menu reflects current location, closes on anchor click and survives resize', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await scrollToSection(page, 'calculator');
    await nav(page).getByRole('button', { name: '메뉴 열기' }).click();
    await expect(link(page, 'calculator')).toHaveAttribute('aria-current', 'location');
    await page.screenshot({ path: info.outputPath('mobile-active.png') });
    await link(page, 'faq').click();
    await expect(page.getByTestId('landing-mobile-menu')).toHaveCount(0);
    await expect(page).toHaveURL(/#faq$/);
    // The collapsed desktop copy still exposes hook state in the DOM.
    await expect(nav(page).locator('a[href="#faq"]').first()).toHaveAttribute('aria-current', 'location');
    await page.setViewportSize({ width: 1440, height: 900 });
    // Responsive reflow changes document positions; seek the current section
    // again, then verify desktop and mobile share the same location.
    await scrollToSection(page, 'service');
    await expect(nav(page).getByRole('button', { name: '서비스 설명' })).toHaveAttribute('aria-current', 'location');
    await page.setViewportSize({ width: 390, height: 844 });
    await scrollToSection(page, 'service');
    await nav(page).getByRole('button', { name: '메뉴 열기' }).click();
    await expect(link(page, 'service')).toHaveAttribute('aria-current', 'location');
    await expect(link(page, 'faq')).not.toHaveAttribute('aria-current');
  });
});
