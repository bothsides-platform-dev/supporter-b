/**
 * BidDetailModal PDF iframe + ETag (Stage 1 + Stage 2 verification).
 *
 * Stage 1 (a225a18) restored the iframe by emitting `/api/files/{id}` from
 * the repo layer. Stage 2 (c078660) added ETag + If-None-Match so re-opening
 * the modal returns 304 without re-downloading bytes. This spec wires the
 * two together — the only path that exercises both at runtime through a
 * real browser.
 *
 * `attachTossProposalPdf` uploads a tiny PDF to the toss bid on
 * P-2604-0001 (via the shared FILE_STORAGE_DIR storage backend the route
 * reads from — see playwright.config.ts) so the buyer has something to
 * preview.
 */
import { test, expect } from 'playwright/test';

import {
  attachTossProposalPdf,
  loginAs,
  resetRfpForKanban,
} from './_helpers';

const RFP_ID = 'P-2604-0001';

test.describe.serial('FocusComparison — 제안서 PDF 미리보기 iframe', () => {
  // This spec is the first to cold-navigate to /rfp/[id] in dev mode.
  // Next.js Turbopack compiles the route on first request — this can exceed
  // the global 30 s test timeout. Give the describe block 90 s to cover it.
  test.setTimeout(90_000);

  let attachmentId: string;

  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
    attachmentId = await attachTossProposalPdf(RFP_ID);
  });

  test('first open → 200 + ETag; second open → 304', async ({ page }) => {

    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_ID}`);
    // 포커스 비교 — 서포터 B 페이 탭으로 전환한 뒤 'PG 메모 · 제안서 PDF'
    // 아코디언을 펼치면 BidPdfPane(iframe) 가 마운트된다.
    await page.getByRole('tab', { name: /서포터 B 페이/ }).click();

    // 아코디언 펼침 시 iframe 의 /api/files/{id} 요청을 잡아 Stage 1 계약
    // (200 + application/pdf + ETag) 을 검증한다.
    const firstReq = page.waitForResponse((r) =>
      r.url().includes(`/api/files/${attachmentId}`),
    );
    await page.getByRole('button', { name: /제안서 PDF/ }).click();
    const first = await firstReq;
    expect(first.status()).toBe(200);
    expect(first.headers()['content-type']).toBe('application/pdf');
    expect(first.headers()['etag']).toBe(`"${attachmentId}"`);
    expect(first.headers()['accept-ranges']).toBe('bytes');

    // iframe is mounted with the route URL as its src.
    const iframe = page.locator(`iframe[src*="/api/files/${attachmentId}"]`);
    await expect(iframe).toBeVisible();

    // Stage 2 contract — conditional GET. We can't reliably exercise this
    // through the iframe (chromium/Playwright doesn't always revalidate
    // iframe sources on modal re-mount; If-None-Match never leaves the
    // browser). Issue the request directly with `If-None-Match` set, so
    // the route's 304 branch (route.ts:152) has actual coverage.
    const conditional = await page.request.get(
      `/api/files/${attachmentId}`,
      { headers: { 'If-None-Match': `"${attachmentId}"` } },
    );
    expect(conditional.status()).toBe(304);
    expect(conditional.headers()['etag']).toBe(`"${attachmentId}"`);
  });
});
