import { test, expect } from "playwright/test";
import { createGuestDraft, GUEST_DRAFT_KEY } from "@/lib/guest-rfp/draft";

test.skip(
  process.env.GUEST_RFP_AUTO_SEND_ENABLED !== "true",
  "Run with GUEST_RFP_AUTO_SEND_ENABLED=true after the legacy suite.",
);
for (const width of [390, 1280]) {
  test(`automatic request confirmation and once-only completion at ${width}px`, async ({
    page,
  }) => {
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
          revision: 1, tierBasis: 'unknown', annualRevenue: null, answers: draft.data, files: [], attachmentCount: 0,
          recommendation: { risk: 'white', industryName: '방문 돌봄', candidates: [{ pgWorkspaceId: 'pg', name: 'Alpha Payments', reason: '업종 상담', merchantTier: null, feeRate: null, feeNote: '' }] },
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
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.getByRole("button", { name: "작성 마치기" }).click();
    const choice = page.getByRole('radio', { name: /Alpha Payments/ });
    await expect(choice).toBeVisible({ timeout: 20000 });
    await choice.check();
    if (width < 1024) await page.getByRole('button', { name: '다음', exact: true }).click();
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
    await page.reload();
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await expect(
      page.getByRole("heading", { name: "Alpha Payments에 견적을 요청했어요" }),
    ).toBeVisible();
    expect(claims).toBe(1);
    expect(page.url()).toContain("/quote-start");
  });
}

test('attachment save failure keeps answers and prevents reservation until retry succeeds', async ({ page }) => {
  test.setTimeout(60000);
  const draft = createGuestDraft();
  Object.assign(draft.data, { contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '첨부 확인', mainProducts: '의류', deliveryServicePeriod: 'D+3', industryMode: 'custom', customIndustryName: '의류', contractType: 'new', requiredPaymentMethods: ['card'], productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] } });
  await page.addInitScript(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key: GUEST_DRAFT_KEY, draft });
  let fail = true, reservations = 0;
  await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/guest-rfp/drafts', route => {
    const input = route.request().postDataJSON();
    if (input.op === 'file') return route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: 'upload failed' } : { id: 'file', ready: true } });
    return route.fulfill({ json: { id: draft.id, revision: 1, ok: true } });
  });
  await page.route('**/api/guest-rfp/requests', route => {
    const input = route.request().postDataJSON();
    if (input.op === 'reserve') reservations++;
    return route.fulfill({ json: input.op === 'account' ? { signedIn: false, workspaces: [] }
      : input.op === 'recommend' ? { revision: 1, tierBasis: 'unknown', annualRevenue: null, answers: draft.data, files: [], attachmentCount: 1, recommendation: { risk: 'white', industryName: '의류', candidates: [{ pgWorkspaceId: 'pg', name: 'Alpha', reason: '상담', merchantTier: null, feeRate: null, feeNote: '' }] } }
      : input.op === 'status' ? reservations ? { id: draft.id, status: 'unbound', pgName: 'Alpha' } : null : { ok: true } });
  });
  await page.goto('/quote-start');
  await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
  await page.getByLabel('견적 요청 첨부 파일', { exact: true }).setInputFiles({ name: '소개.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 fixture') });
  await page.getByRole('button', { name: '작성 마치기' }).click();
  await page.getByRole('radio', { name: /Alpha/ }).check({ timeout: 20000 });
  await page.getByRole('button', { name: '선택한 PG사에 자동 요청하기' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '소개.pdf' })).toContainText('소개.pdf 저장을 완료하지 못했어요');
  expect(reservations).toBe(0);
  fail = false;
  await page.getByRole('button', { name: '다시 확인해요' }).click();
  await page.getByRole('button', { name: '선택한 PG사에 자동 요청하기' }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
  expect(reservations).toBe(1);
});
