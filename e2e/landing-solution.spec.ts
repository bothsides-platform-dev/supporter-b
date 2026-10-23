import { test, expect } from "playwright/test";

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [768, 1024],
  [390, 844],
  [320, 568],
]) {
  for (const theme of ["light", "dark"]) {
    test(`solution ${width}x${height} ${theme}`, async ({ page }, info) => {
      const hydrationErrors: string[] = [];
      page.on("console", (msg) => {
        if (/hydration|did not match/i.test(msg.text()))
          hydrationErrors.push(msg.text());
      });
      await page.setViewportSize({ width, height });
      await page.route("**/api/auth/session", (route) =>
        route.fulfill({ json: {} }),
      );
      await page.goto("/");
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      const section = page.locator("#service");
      const track = section.locator(":scope > div");
      await expect(section.locator("article")).toHaveCount(4);
      await expect(section.getByRole("button")).toHaveCount(0);
      await expect(section.getByRole("table")).toHaveCount(0);
      await expect(track).toHaveAttribute("data-pinned", String(width >= 1024));
      if (width >= 1024) {
        for (const step of [0, 1, 2, 3, 0]) {
          await track.evaluate(
            (el, step) =>
              window.scrollTo({
                top:
                  window.scrollY +
                  el.getBoundingClientRect().top -
                  68 +
                  innerHeight * 2.8 * ((step + 0.5) / 4),
                behavior: "instant",
              }),
            step,
          );
          const scene = section.getByRole("article");
          await expect(scene).toHaveCount(1);
          await expect(scene.locator("[data-example]")).toHaveAttribute(
            "data-example",
            ["fee", "conditions", "negotiation", "decision"][step],
          );
          await page.waitForTimeout(260);
          const bounds = await scene.boundingBox();
          expect(bounds!.y).toBeGreaterThanOrEqual(68);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
          await page.screenshot({ path: info.outputPath(`scene-${step}.png`) });
        }
      } else {
        await expect(section.getByRole("article")).toHaveCount(4);
        for (const scene of await section.getByRole("article").all()) {
          await scene.scrollIntoViewIfNeeded();
          expect(
            await scene.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
        }
        await section.screenshot({
          path: info.outputPath("mobile-all.png"),
          style:
            "body > div header, nextjs-portal { visibility: hidden !important; }",
        });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(hydrationErrors).toEqual([]);
    });
  }
}

test("solution switches to document flow on resize, short height and reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.goto("/");
  const section = page.locator("#service");
  const track = section.locator(":scope > div");
  await expect(track).toHaveAttribute("data-pinned", "true");
  await page.setViewportSize({ width: 1440, height: 400 });
  await expect(track).toHaveAttribute("data-pinned", "false");
  await expect(section.getByRole("article")).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(section.getByRole("article")).toHaveCount(4);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(track).toHaveAttribute("data-pinned", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveAttribute("data-pinned", "false");
  await expect(section.getByRole("article")).toHaveCount(4);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(track).toHaveAttribute("data-pinned", "true");
});
