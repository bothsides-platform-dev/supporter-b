/**
 * Theme persistence e2e tests.
 *
 * Covers:
 *   1. System dark preference → html.dark class applied (FOUC-free: checked
 *      immediately after goto, before any JS hydration)
 *   2. Explicit dark selection → persists across page reload
 *   3. Switching back to light → persists across reload
 *   4. Browser chrome (<meta name="theme-color">) follows the in-app theme
 *      rather than the OS preference — both on first paint (inline script) and
 *      after the toggle (theme store). This is the only place the head ordering
 *      between Next's metadata tags and our inline script is actually observable.
 *
 * Uses the public /login page — no auth required.
 */
import { test, expect } from 'playwright/test';

const THEME_KEY = 'support-b-theme';
// lib/theme/canvas-colors.ts 와 같은 값 — e2e 는 앱 모듈을 import 하지 않으므로 리터럴로 둔다.
// 토큰과의 일치는 app/__tests__/chrome-colors.test.ts 가 고정한다.
const LIGHT_CANVAS = '#FFFFFF';
const DARK_CANVAS = '#08090A';

/**
 * 브라우저가 실제로 고르는 크롬 색을 읽는다 — "tree order 상 media 가 매치되는 첫 태그".
 * 태그 목록을 그대로 비교하지 않는 이유: Next 의 media 스코프 태그 두 개는 OS 기준
 * 폴백으로 남겨 두는 설계라, 의미 있는 단언은 "무엇이 이기는가" 하나뿐이다.
 */
function effectiveThemeColor(page: import('playwright/test').Page) {
  return page.evaluate(() => {
    for (const m of document.head.querySelectorAll('meta[name="theme-color"]')) {
      const media = m.getAttribute('media');
      if (media && !window.matchMedia(media).matches) continue;
      return m.getAttribute('content');
    }
    return null;
  });
}

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
    // Root-cause: Zustand's onRehydrateStorage calls setTheme('system') on the
    // beforeEach page load (Zustand v5 passes initial state when storage is
    // empty), which installs a prefers-color-scheme media listener. When
    // emulateMedia fires that listener as an async macrotask between Playwright
    // CDP round-trips, Zustand overwrites our localStorage value with
    // {theme:'system'} AFTER our setItem('light') but BEFORE the reload.
    //
    // Fix: use addInitScript to inject the desired value BEFORE any page
    // scripts run (including before the inline theme script and Zustand).
    // addInitScript survives page.reload() within the same context, so Zustand
    // initialises with theme:'light', never installs the media listener, and
    // never overwrites our value.
    await page.context().addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: THEME_KEY, value: JSON.stringify({ state: { theme: 'light' }, version: 0 }) },
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(false);
  });

  // 인라인 스크립트 갈래.
  test('저장된 다크 테마 → OS 가 라이트여도 크롬 색이 다크다', async ({ page }) => {
    await page.context().addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: THEME_KEY, value: JSON.stringify({ state: { theme: 'dark' }, version: 0 }) },
    );
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();

    expect(await effectiveThemeColor(page)).toBe(DARK_CANVAS);
  });

  // 하이드레이션 이후에도 유지되는지 — React 가 소유한 태그를 건드리던 초안에서는
  // 하이드레이션이 스테일 태그를 되살려 이 단언이 깨졌다(잉여 theme-color 3개 관측).
  test('하이드레이션 후에도 크롬 색이 인앱 테마를 유지한다', async ({ page }) => {
    await page.context().addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: THEME_KEY, value: JSON.stringify({ state: { theme: 'dark' }, version: 0 }) },
    );
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    // 토글이 인터랙티브해지는 시점 = 하이드레이션 완료 신호.
    await page.getByRole('button', { name: '라이트 모드로 전환' }).first().waitFor();

    expect(await effectiveThemeColor(page)).toBe(DARK_CANVAS);
  });

  // 테마 스토어 갈래 — 뷰 트랜지션 래퍼를 포함한 실제 토글 경로를 끝까지 통과시킨다.
  test('테마 토글 클릭 → 크롬 색이 따라 바뀐다', async ({ page }) => {
    await page.context().addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: THEME_KEY, value: JSON.stringify({ state: { theme: 'light' }, version: 0 }) },
    );
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    expect(await effectiveThemeColor(page)).toBe(LIGHT_CANVAS);

    await page.getByRole('button', { name: '다크 모드로 전환' }).first().click();

    await expect.poll(() => effectiveThemeColor(page)).toBe(DARK_CANVAS);
  });
});
