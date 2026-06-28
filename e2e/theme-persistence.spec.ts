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
    // Ensure each test starts with a clean theme slate — prevents state
    // bleed from Zustand's persist saving values during the beforeEach load.
    await page.evaluate((key) => localStorage.removeItem(key), THEME_KEY);
  });

  test('system dark emulation → html has .dark class before JS hydration', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate((key) => localStorage.removeItem(key), THEME_KEY);
    // page.reload() guarantees the inline <head> theme script re-runs with
    // the current localStorage and media emulation, avoiding the same-URL
    // same-document navigation that can skip a fresh page load.
    await page.reload();

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(true);
  });

  test('system light emulation → html does not have .dark class', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate((key) => localStorage.removeItem(key), THEME_KEY);
    await page.reload();

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

    await page.reload();

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

    await page.reload();

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(false);
  });
});
