import { test, expect } from 'playwright/test';

// Public landing geometry: no account or database data is needed.
// The fixed verb (suffix) closes the brand line; the rolling phrase gets its own line below it.
for (const scenario of [
  { route: '/', phrase: '내가 결정하는 PG 계약을', suffix: '만듭니다.' },
  { route: '/pg-landing', phrase: '먼저 도착하는 인바운드를', suffix: '만나세요.' },
]) {
  test(`320px ${scenario.route} keeps every settled word inside its mask`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(scenario.route);
    await page.evaluate(() => document.fonts.ready);
    const current = page.locator('[data-roll-layer="current"]').first();
    await expect(current).toHaveText(scenario.phrase, { timeout: 20_000 });
    await expect(page.locator('[data-roll-layer="next"]')).toHaveCount(0);

    const geometry = await current.evaluate((layer, suffixText) => {
      const root = layer.parentElement!.parentElement!;
      const clip = root.parentElement!.parentElement!.getBoundingClientRect();
      const words = Array.from(layer.querySelectorAll('[data-roll-word]'), word => {
        const rect = word.getBoundingClientRect();
        return { text: word.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      const suffix = Array.from(document.querySelectorAll('span')).find(el => el.textContent === suffixText && el.children.length === 0)!;
      return { words, clip: { left: clip.left, right: clip.right, top: clip.top, bottom: clip.bottom }, suffixBottom: suffix.parentElement!.getBoundingClientRect().bottom };
    }, scenario.suffix);
    expect(geometry.words.map(word => word.text).join(' ')).toBe(scenario.phrase);
    for (const word of geometry.words) {
      expect(word.left).toBeGreaterThanOrEqual(geometry.clip.left - 0.5);
      expect(word.right).toBeLessThanOrEqual(geometry.clip.right + 0.5);
      expect(word.top).toBeGreaterThanOrEqual(geometry.clip.top - 0.5);
      expect(word.bottom).toBeLessThanOrEqual(geometry.clip.bottom + 0.5);
      expect(word.top).toBeGreaterThanOrEqual(geometry.suffixBottom - 0.5);
    }
  });
}
