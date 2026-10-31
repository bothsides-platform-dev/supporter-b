import { test, expect } from "playwright/test";

// Full interaction coverage uses one mobile/light and one desktop/dark case.
for (const [width, height, theme] of [
  [390, 844, "light"],
  [1440, 900, "dark"],
] as const) {
  test(`solution ${width}x${height} ${theme}`, async ({ page }) => {
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
    await page.evaluate(() => document.fonts.ready);
    const section = page.locator("#service");
    const track = section.locator(":scope > div");
    const buttons = section.getByRole("button");
    const table = section.getByRole("table");
    await expect(buttons).toHaveCount(4);
    await expect(table).toHaveCount(1);
    await expect(table.getByRole("columnheader")).toHaveCount(7);
    for (const button of await buttons.all())
      await expect(button).toBeVisible();
    const canFit = width >= 1024;
    await expect(track).toHaveAttribute("data-pinned", String(canFit));
    if (canFit) {
      let fixed: { heading: number; table: number } | undefined;
      for (const step of [0, 1, 2, 3, 2, 1, 0]) {
        await track.evaluate(
          (el, step) =>
            window.scrollTo({
              top:
                scrollY +
                el.getBoundingClientRect().top -
                parseFloat(getComputedStyle(el.firstElementChild!).top) +
                innerHeight * 1.6 * ((step + 0.5) / 4),
              behavior: "instant",
            }),
          step,
        );
        await expect(buttons.nth(step)).toHaveAttribute("aria-pressed", "true");
        const columns = await table
          .locator('th[data-active="true"]')
          .allTextContents();
        expect(columns).toEqual(
          [
            ["수수료"],
            ["정산주기", "보증보험", "가입비", "승인 상태"],
            ["협의 가능 여부"],
            [],
          ][step],
        );
        await expect(table.locator('tbody tr[data-active="true"]')).toHaveCount(
          step === 3 ? 1 : 0,
        );
        const frameContent = track.locator(":scope > div > div");
        const bounds = await frameContent.boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(68);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
        // The heading enters with a 16px translation; measure only after it settles.
        await expect(section.locator("h2").locator("..")).toHaveCSS(
          "transform",
          "none",
        );
        const headingBox = (await section.locator("h2").boundingBox())!;
        const tableBox = (await table.boundingBox())!;
        if (fixed) {
          expect(Math.abs(headingBox.y - fixed.heading)).toBeLessThan(2);
          expect(Math.abs(tableBox.y - fixed.table)).toBeLessThan(2);
        }
        fixed = { heading: headingBox.y, table: tableBox.y };
        const item = buttons.nth(step).locator("xpath=../..");
        await expect
          .poll(async () => {
            const itemBox = (await item.boundingBox())!;
            const windowBox = (await section
              .locator("ul")
              .locator("..")
              .boundingBox())!;
            return Math.abs(
              itemBox.y +
                itemBox.height / 2 -
                windowBox.y -
                windowBox.height / 2,
            );
          })
          .toBeLessThan(2);
        const itemBox = (await item.boundingBox())!;
        const windowBox = (await section
          .locator("ul")
          .locator("..")
          .boundingBox())!;
        expect(
          Math.abs(
            itemBox.y + itemBox.height / 2 - windowBox.y - windowBox.height / 2,
          ),
        ).toBeLessThan(2);
        expect(itemBox.y).toBeGreaterThanOrEqual(windowBox.y);
        expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(
          windowBox.y + windowBox.height,
        );
      }
      await buttons.nth(2).focus();
      await buttons.nth(2).click();
      await expect(buttons.nth(2)).toHaveAttribute("aria-pressed", "true");
      await buttons.nth(1).focus();
      await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Enter");
      await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
      await buttons.nth(3).focus();
      await page.keyboard.press("Space");
      await expect(buttons.nth(3)).toHaveAttribute("aria-pressed", "true");
    } else {
      await section.scrollIntoViewIfNeeded();
      // Offscreen color transitions begin when the browser paints the table.
      // Wait for the rendered theme token.
      const bodyColor = await table
        .locator(".md-numeric")
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      await expect(
        table.locator("td:first-child .font-medium").first(),
      ).toHaveCSS("color", bodyColor);
    }
    const scroller = section.getByRole("region", { name: "견적 비교 예시" });
    if (width < 1024) {
      expect(
        await table.evaluate((el) => el.getBoundingClientRect().width),
      ).toBeGreaterThanOrEqual(960);
      await scroller.scrollIntoViewIfNeeded();
      const firstCell = table.locator("tbody tr").first().locator("td").first();
      const x = (await firstCell.boundingBox())!.x;
      await scroller.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => scroller.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      await scroller.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await expect
        .poll(async () => Math.abs((await firstCell.boundingBox())!.x - x))
        .toBeLessThan(2);
    }
    // Shared branding must agree with the decorative hero table on this page.
    const names = await table
      .locator("tbody tr td:first-child img")
      .evaluateAll((imgs) => imgs.map((img) => img.getAttribute("src")));
    const heroNames = await page.locator("#service").evaluate((el) => {
      const heroTable = document.querySelector("table");
      return heroTable && !el.contains(heroTable)
        ? Array.from(
            heroTable.querySelectorAll("tbody tr td:first-child img"),
            (img) => img.getAttribute("src"),
          )
        : null;
    });
    expect(heroNames).toEqual(names);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(hydrationErrors).toEqual([]);
  });
}

test("solution remeasures content, viewport and reduced motion", async ({
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
  for (const element of [
    section.locator("h2"),
    section.locator("li p").first(),
    section.locator("p").last(),
  ]) {
    await element.evaluate((el) => {
      el.style.paddingBottom = "900px";
    });
    await expect(track).toHaveAttribute("data-pinned", "false");
    await element.evaluate((el) => {
      el.style.paddingBottom = "";
    });
    await expect(track).toHaveAttribute("data-pinned", "true");
  }
  const description = section.locator("li p").nth(1);
  const original = await description.textContent();
  await description.evaluate((el) => {
    el.textContent = el.textContent!.repeat(4);
  });
  await expect(track).toHaveAttribute("data-pinned", "true");
  await section.getByRole("button").nth(1).focus();
  await expect(section.getByRole("button").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const descriptionBox = (await description.boundingBox())!;
  const windowBox = (await section.locator("ul").locator("..").boundingBox())!;
  expect(descriptionBox.y).toBeGreaterThanOrEqual(windowBox.y);
  expect(descriptionBox.y + descriptionBox.height).toBeLessThanOrEqual(
    windowBox.y + windowBox.height,
  );
  await description.evaluate((el, text) => {
    el.textContent = text;
  }, original);
  await page.setViewportSize({ width: 1440, height: 400 });
  await expect(track).toHaveAttribute("data-pinned", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(track).toHaveAttribute("data-pinned", "false");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(track).toHaveAttribute("data-pinned", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveAttribute("data-pinned", "false");
  await section.getByRole("button").nth(1).click();
  const y = await page.evaluate(() => scrollY);
  await section.getByRole("button").nth(1).press("Enter");
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await expect(section.getByRole("table")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(track).toHaveAttribute("data-pinned", "true");
});

// Breakpoint checks do not replay the complete scroll/keyboard journey.
test("solution switches layout at 1024px and fits narrow screens", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const section = page.locator("#service");
  const track = section.locator(":scope > div");
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(track).toHaveAttribute("data-pinned", String(width >= 1024));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 320) {
      for (const button of await section.getByRole("button").all()) {
        expect(
          await button.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
      }
    }
  }
});
