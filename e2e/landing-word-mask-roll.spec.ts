import { test, expect } from "playwright/test";

// Public landing geometry: no account or database data is needed.
// Buyer situations precede the fixed sentence; PG keeps its fixed sentence first.
for (const scenario of [
  {
    route: "/",
    phrase: "받은 견적이 회사에 유리한지 판단이 어려울 때.",
    suffix: "찾아주세요.",
  },
  {
    route: "/pg-landing",
    phrase: "먼저 도착하는 인바운드를",
    suffix: "만나세요.",
  },
]) {
  for (const [width, height] of [
    [320, 800],
    [390, 568],
    [768, 1024],
    [1440, 900],
    [1440, 600],
  ]) {
    test(`${width}x${height} ${scenario.route} keeps every settled word inside its mask`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(scenario.route);
      await page.evaluate(() => document.fonts.ready);
      const current = page.locator('[data-roll-layer="current"]').first();
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toBeVisible();
      const reservedHeight = (await heading.boundingBox())!.height;
      await expect(current).toHaveText(scenario.phrase, { timeout: 20_000 });
      await expect(page.locator('[data-roll-layer="next"]')).toHaveCount(0);

      const geometry = await current.evaluate((layer, suffixText) => {
        const root = layer.parentElement!.parentElement!;
        const clip = root.parentElement!.parentElement!.getBoundingClientRect();
        const words = Array.from(
          layer.querySelectorAll("[data-roll-word]"),
          (word) => {
            const rect = word.getBoundingClientRect();
            return {
              text: word.textContent,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            };
          },
        );
        const suffix = Array.from(document.querySelectorAll("span")).find(
          (el) => el.textContent === suffixText && el.children.length === 0,
        )!;
        return {
          words,
          clip: {
            left: clip.left,
            right: clip.right,
            top: clip.top,
            bottom: clip.bottom,
          },
          suffixTop: suffix.parentElement!.getBoundingClientRect().top,
          suffixBottom: suffix.parentElement!.getBoundingClientRect().bottom,
        };
      }, scenario.suffix);
      expect((await heading.boundingBox())!.height).toBeCloseTo(
        reservedHeight,
        0,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(geometry.words.map((word) => word.text).join(" ")).toBe(
        scenario.phrase,
      );
      for (const word of geometry.words) {
        expect(word.left).toBeGreaterThanOrEqual(geometry.clip.left - 0.5);
        expect(word.right).toBeLessThanOrEqual(geometry.clip.right + 0.5);
        expect(word.top).toBeGreaterThanOrEqual(geometry.clip.top - 0.5);
        expect(word.bottom).toBeLessThanOrEqual(geometry.clip.bottom + 0.5);
        if (scenario.route === "/")
          expect(word.bottom).toBeLessThanOrEqual(geometry.suffixTop + 0.5);
        else
          expect(word.top).toBeGreaterThanOrEqual(geometry.suffixBottom - 0.5);
      }
    });
  }
}
