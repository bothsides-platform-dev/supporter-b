import { test, expect } from "playwright/test";
import { createGuestDraft, GUEST_DRAFT_KEY } from "@/lib/guest-rfp/draft";

test.skip(
  process.env.GUEST_RFP_AUTO_SEND_ENABLED !== "true",
  "Run with GUEST_RFP_AUTO_SEND_ENABLED=true after the legacy suite.",
);
for (const width of [390, 1280]) {
  test(`automatic request confirmation and once-only completion at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const draft = createGuestDraft();
    Object.assign(draft.data, {
      contentQuestion: "attachments",
      websiteUrl: "https://example.com",
      title: "테스트",
      mainProducts: "상품",
      deliveryServicePeriod: "D+3",
      industryMode: "custom",
      customIndustryName: "방문 돌봄",
      contractType: "new",
      requiredPaymentMethods: ["card"],
      productInfo: {
        cashConvertible: false,
        maximumPrice: "under_100k",
        salesMethods: ["none"],
      },
    });
    await page.addInitScript(
      ({ key, draft }) => {
        if (window === window.top && !localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(draft));
      },
      { key: GUEST_DRAFT_KEY, draft },
    );
    await page.route("**/api/guest-rfp/events", (route) =>
      route.fulfill({ json: { ok: true } }),
    );
    await page.route("**/api/guest-rfp/drafts", (route) =>
      route.fulfill({ json: { ok: true, id: draft.id, revision: 1 } }),
    );
    let state: null | "unbound" | "submitted" = null;
    let claims = 0;
    await page.route("**/api/guest-rfp/requests", async (route) => {
      const input = route.request().postDataJSON();
      let json: unknown = { ok: true };
      if (input.op === "account")
        json = {
          signedIn: true,
          email: "buyer@example.com",
          workspaces: [
            {
              id: "workspace",
              name: "구매회사",
              verified: true,
              status: "active",
            },
            {
              id: "second",
              name: "다른 회사",
              verified: true,
              status: "active",
            },
          ],
        };
      if (input.op === "recommend")
        json = {
          available: true,
          candidates: [{ id: "pg", name: "Alpha Payments", order: 0 }],
        };
      if (input.op === "reserve") state = "unbound";
      if (input.op === "bind") state = "submitted";
      if (input.op === "status")
        json = state && {
          id: draft.id,
          status: state,
          pgName: "Alpha Payments",
          rfpCode: state === "submitted" ? "P-2610-0001" : null,
          deadline: state === "submitted" ? "2026-10-30T09:00:00.000Z" : null,
          effectSeen: claims > 0,
        };
      if (input.op === "effect") {
        claims++;
        json = { claimed: claims === 1 };
      }
      await route.fulfill({ json });
    });
    await page.goto("/quote-start");
    await page.getByRole("button", { name: "작성 마치기" }).click();
    await page
      .getByRole("button", { name: "이 정보로 맞춤 견적 받기" })
      .click();
    await page.getByLabel("Alpha Payments").check();
    await expect(
      page.getByText(
        "이메일 인증과 입점 승인이 끝나면 선택한 PG사에 자동으로 보내요.",
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "선택한 PG사에 자동 요청하기" })
      .click();
    await expect(
      page.getByRole("link", { name: "요청한 견적 보기" }),
    ).toHaveCount(0);
    await page.getByLabel("구매회사", { exact: true }).check();
    await page
      .getByRole("button", { name: "이 회사로 요청을 이어갈게요" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Alpha Payments에 견적을 요청했어요" }),
    ).toBeFocused();
    await expect(
      page.getByRole("link", { name: "요청한 견적 보기" }),
    ).toHaveAttribute("href", "/rfp/P-2610-0001");
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`auto-request-${width}.png`),
      fullPage: true,
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Alpha Payments에 견적을 요청했어요" }),
    ).toBeVisible();
    expect(claims).toBe(1);
    expect(page.url()).toContain("/quote-start");
  });
}
