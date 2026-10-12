import { test, expect } from "playwright/test";

const sizes = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
for (const size of sizes) {
  test(`핵심 체험 완주 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    const businessRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/") &&
        /rfp|bid|signing|files|contract|messages/.test(request.url())
      )
        businessRequests.push(request.url());
      if (request.method() === "POST" && request.headers()["next-action"])
        businessRequests.push(request.url());
    });
    await page.goto("/demo");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "핵심 흐름 체험하기", exact: true })
      .click();
    await expect(
      page.locator('[data-coachmark="tutorial-award-cta"]'),
    ).toBeVisible();
    if (size.width < 768) {
      await expect(
        page.getByRole("button", { name: "설명 보기" }),
      ).toHaveAttribute("aria-expanded", "false");
    }
    await expect(
      page.getByRole("button", { name: "받은 견적 확인하기", exact: true }),
    ).toHaveCount(0);
    const chatFab = page.getByRole("button", {
      name: "채팅 열기",
      exact: true,
    });
    if (await chatFab.isVisible()) {
      const fabRect = await chatFab.boundingBox();
      const footerRect = await page.getByLabel("데모 체험 안내").boundingBox();
      expect(fabRect!.y + fabRect!.height).toBeLessThanOrEqual(footerRect!.y);
    }
    await page.screenshot({
      path: `test-results/demo-quote-${size.width}.png`,
    });
    const quoteButton = page.locator('[data-coachmark="tutorial-award-cta"]');
    await page.getByRole("button", { name: "위치 보기" }).click();
    await expect(quoteButton).toBeFocused();
    const buttonRect = await quoteButton.boundingBox();
    const guideRect = await page.getByLabel("데모 체험 안내").boundingBox();
    expect(buttonRect!.y + buttonRect!.height).toBeLessThanOrEqual(
      guideRect!.y,
    );
    await page.locator('[data-coachmark="tutorial-award-cta"]').click();
    const award = page.getByRole("dialog");
    await expect(award.locator("[data-demo-guide-slot]")).toContainText("조건");
    await award.getByRole("button", { name: "닫기", exact: true }).click();
    await page.locator('[data-coachmark="tutorial-award-cta"]').click();
    await page.locator('[data-coachmark="demo-award-confirm"]').click();
    await page
      .getByRole("button", { name: "서명 체험하기", exact: true })
      .click();
    if (size.width === 390) {
      // Exercise a reduced viewport while typing; physical OS keyboards still
      // need a real-device check.
      await page.setViewportSize({ width: 390, height: 450 });
      const name = page.getByRole("textbox", { name: "서명자 이름" });
      await name.fill("김체험");
      await name.press("Tab");
      await expect(page.getByRole("checkbox")).toBeFocused();
      await page.getByRole("checkbox").press("Space");
      await page.getByRole("checkbox").press("Tab");
      const complete = page.getByRole("button", {
        name: "서명 완료하기",
        exact: true,
      });
      await expect(complete).toBeFocused();
      await complete.press("Enter");
    } else {
      await page
        .getByRole("button", { name: "예시로 완료하기", exact: true })
        .click();
    }
    // A viewport change must preserve the session.
    await page.setViewportSize({ width: size.height, height: size.width });
    await page.setViewportSize(size);
    await page
      .getByRole("button", { name: "계약 보관함 보기", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "모두 체험했어요" }),
    ).toBeVisible();
    const start = page.getByRole("link", { name: "내 조건으로 견적 요청하기" });
    for (const link of await start.all())
      await expect(link).toHaveAttribute("href", "/quote-start");
    expect(businessRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/demo-${size.width}.png` });
  });
  test(`전체 체험 회귀 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/demo");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "견적 요청부터 체험하기" }).click();
    await page
      .getByRole("link", { name: "견적 요청하기", exact: true })
      .click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const questions = page.getByLabel("질문 진행률");
    await expect(questions).toBeVisible();
    for (let i = 0; i < 25 && (await questions.isVisible()); i++) {
      await page.locator('[data-coachmark="demo-question-next"]').click();
    }
    await page.locator('[data-coachmark="demo-pg-choice"]').click();
    const reviewNext = page.locator('[data-coachmark="demo-review-next"]');
    if (await reviewNext.isVisible()) await reviewNext.click();
    await page.locator('[data-coachmark="tutorial-wizard-submit"]').click();
    await page.getByPlaceholder(/메시지/).fill("정산주기 조정이 가능한가요?");
    await page.locator('[data-coachmark="demo-send"]').click();
    await expect(
      page.locator('[data-coachmark="demo-open-quote"]'),
    ).toHaveAttribute("data-demo-next-action", "");
    await page
      .getByRole("button", { name: "받은 견적 확인하기", exact: true })
      .click();
    await page.locator('[data-coachmark="tutorial-award-cta"]').click();
    await page.locator('[data-coachmark="demo-award-confirm"]').click();
    await page
      .getByRole("button", { name: "서명 체험하기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "예시로 완료하기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "계약 보관함 보기", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "모두 체험했어요" }),
    ).toBeVisible();
  });
}

test("핵심 체험 재시작과 체험 변경은 확인 후 초기화한다", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "핵심 흐름 체험하기" }).click();
  await page.locator('[data-coachmark="tutorial-award-cta"]').click();
  await page.locator('[data-coachmark="demo-award-confirm"]').click();
  await page.getByText("더보기", { exact: true }).click();
  await page.getByRole("button", { name: "처음부터", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "서명 체험하기", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "처음부터", exact: true }).click();
  await page
    .getByRole("button", { name: "다시 시작하기", exact: true })
    .click();
  await expect(
    page.locator('[data-coachmark="tutorial-award-cta"]'),
  ).toBeVisible();
  await page.getByText("더보기", { exact: true }).click();
  await page.getByRole("button", { name: "체험 바꾸기", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "체험 바꾸기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "핵심 흐름 체험하기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "견적 요청부터 체험하기" }).click();
  await expect(
    page.getByRole("link", { name: "견적 요청하기", exact: true }),
  ).toBeVisible();
});
