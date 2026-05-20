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
 * P-2604-0001 (via the same Postgres `attachment_blobs` backend the route
 * reads from) so the buyer has something to preview.
 */
import { test, expect } from 'playwright/test';

import {
  attachTossProposalPdf,
  loginAs,
  resetRfpForKanban,
} from './_helpers';

const RFP_ID = 'P-2604-0001';

test.describe.serial('BidDetailModal — PDF preview iframe', () => {
  let attachmentId: string;

  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
    attachmentId = await attachTossProposalPdf(RFP_ID);
  });

  test('first open → 200 + ETag; second open → 304', async ({ page }) => {

    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_ID}`);
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();

    // First modal open — capture the iframe's /api/files/{id} request and
    // assert the Stage 1 contract (200 + application/pdf + ETag).
    const firstReq = page.waitForResponse((r) =>
      r.url().includes(`/api/files/${attachmentId}`),
    );
    await page.getByRole('button', { name: /토스페이먼츠/ }).first().click();
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
