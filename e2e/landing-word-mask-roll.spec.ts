import { test, expect } from "playwright/test";

// Public landing geometry: no account or database data is needed.
// Buyer situations precede the fixed sentence; PG keeps its fixed sentence first.
for (const scenario of [
  {
    route: "/",
    phrases: [
      "PG사마다 같은 설명을 반복하기 번거로울 때.",
      "받은 견적이 회사에 유리한지 판단이 어려울 때.",
      "우리 서비스가 PG사에 가입이 될지 막막할 때.",
      "결제 오픈 전까지 무엇부터 준비할지 고민될 때.",
    ],
    suffix: "찾아주세요.",
  },
  {
    route: "/pg-landing",
    phrases: ["먼저 도착하는 인바운드를"],
    suffix: "만나세요.",
  },
]) {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    test(`${width}x${height} ${scenario.route} keeps every settled word inside its mask`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const start = new Date();
      await page.clock.install({ time: start });
      await page.goto(scenario.route);
      await page.evaluate(() => document.fonts.ready);
      const current = page.locator('[data-roll-layer="current"]').first();
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toBeVisible();
      // Install before navigation; run every RAF (fastForward would skip frames).
      await page.clock.pauseAt(new Date(start.getTime() + 60_000));
      await page.clock.runFor(1000);
      const reservedHeights = new Map([
        [width, (await heading.boundingBox())!.height],
      ]);
      for (const phrase of scenario.phrases) {
        await expect
          .poll(
            async () => {
              await page.clock.runFor(160);
              return {
                text: await current.textContent(),
                incoming: await heading
                  .locator('[data-roll-layer="next"]')
                  .count(),
              };
            },
            { intervals: [0], timeout: 15_000 },
          )
          .toEqual({ text: phrase, incoming: 0 });

        // Reuse the settled phrase for the 320px clipping regression; no second cycle.
        for (const measuredWidth of width === 390 ? [320, 390] : [width]) {
          await page.setViewportSize({ width: measuredWidth, height });
          await page.clock.runFor(32);
          const headingHeight = (await heading.boundingBox())!.height;
          if (!reservedHeights.has(measuredWidth))
            reservedHeights.set(measuredWidth, headingHeight);
          const geometry = await current.evaluate((layer, suffixText) => {
            const root = layer.parentElement!.parentElement!;
            const clip =
              root.parentElement!.parentElement!.getBoundingClientRect();
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
              suffixBottom:
                suffix.parentElement!.getBoundingClientRect().bottom,
            };
          }, scenario.suffix);
          expect((await heading.boundingBox())!.height).toBeCloseTo(
            reservedHeights.get(measuredWidth)!,
            0,
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(measuredWidth);
          expect(geometry.words.map((word) => word.text).join(" ")).toBe(
            phrase,
          );
          if (scenario.route === "/") {
            const ending = geometry.words.at(-2)!;
            const when = geometry.words.at(-1)!;
            expect(when.text).toBe("때.");
            expect(when.top).toBeCloseTo(ending.top, 0);
          }
          for (const word of geometry.words) {
            expect(word.left).toBeGreaterThanOrEqual(geometry.clip.left - 0.5);
            expect(word.right).toBeLessThanOrEqual(geometry.clip.right + 0.5);
            expect(word.top).toBeGreaterThanOrEqual(geometry.clip.top - 0.5);
            expect(word.bottom).toBeLessThanOrEqual(geometry.clip.bottom + 0.5);
            if (scenario.route === "/")
              expect(word.bottom).toBeLessThanOrEqual(geometry.suffixTop + 0.5);
            else
              expect(word.top).toBeGreaterThanOrEqual(
                geometry.suffixBottom - 0.5,
              );
          }
        }
      }
    });
  }
}
