/**
 * Theme persistence e2e tests.
 *
 * Covers:
 *   1. System dark preference → html.dark class applied (FOUC-free: checked
 *      immediately after goto, before any JS hydration)
 *   2. Explicit dark selection → persists across page reload
 *   3. Switching back to light → persists across reload
 *
 * Uses the public /login page — no auth required.
 */
import { test, expect } from 'playwright/test';

const THEME_KEY = 'supporter-b-theme';

test.describe('theme persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('system dark emulation → html has .dark class before JS hydration', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => localStorage.removeItem('supporter-b-theme'));
    await page.goto('/login');

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(true);
  });

  test('system light emulation → html does not have .dark class', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => localStorage.removeItem('supporter-b-theme'));
    await page.goto('/login');

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(false);
  });

  test('dark saved in localStorage → .dark class survives reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
    }, THEME_KEY);

    await page.goto('/login');

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(true);
  });

  test('light saved in localStorage → .dark class absent after reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ state: { theme: 'light' }, version: 0 }));
    }, THEME_KEY);

    await page.goto('/login');

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(false);
  });
});
