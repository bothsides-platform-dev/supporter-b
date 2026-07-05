/**
 * BidDetailModal PDF iframe (Stage 5 verification — presigned R2 contract).
 *
 * Stage 1 (a225a18) restored the iframe by emitting `/api/files/{id}` from
 * the repo layer. Stage 3 of the R2 attachment storage migration switched
 * `GET /api/files/{id}` from an app-proxy stream (200 + ETag + Range) to a
 * 302 redirect to a time-limited presigned R2 URL — the app never streams
 * bytes for reads anymore, the browser talks to R2 directly. This spec
 * verifies both halves of that contract:
 *
 *   1. The route itself answers 302 with a `Location` pointing at the R2
 *      host and carrying a `X-Amz-Signature` query param (i.e. it really is
 *      a signed URL, not a bare pass-through).
 *   2. Following the redirect actually serves the PDF bytes (200 +
 *      application/pdf) — proves the presigned URL is valid against the
 *      real bucket, not just shaped correctly.
 *   3. The iframe (BidPdfPane) mounts with the route URL as its src, same
 *      as before — the client-side contract (route URL, not the R2 URL
 *      directly) is unchanged by the Stage 3 migration.
 *
 * `attachTossProposalPdf` uploads a tiny PDF to the toss bid on
 * P-2604-0001 via `getStorage().save()` directly in the Playwright
 * process, then the webServer's `/api/files/{id}` route and its presigned
 * redirect target both resolve against the same real R2 bucket (see
 * playwright.config.ts). Self-skips when R2 env is absent.
 */
import { test, expect } from 'playwright/test';

import {
  attachTossProposalPdf,
  loginAs,
  resetRfpForKanban,
} from './_helpers';

const RFP_ID = 'P-2604-0001';

test.describe.serial('FocusComparison — 제안서 PDF 미리보기 iframe', () => {
  test.skip(
    !process.env.R2_BUCKET,
    'requires real R2 config (R2_* env) — attachment bytes must be shared cross-process',
  );

  // This spec is the first to cold-navigate to /rfp/[id] in dev mode.
  // Next.js Turbopack compiles the route on first request — this can exceed
  // the global 30 s test timeout. Give the describe block 90 s to cover it.
  test.setTimeout(90_000);

  let attachmentId: string;

  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
    attachmentId = await attachTossProposalPdf(RFP_ID);
  });

  test('route redirects to a signed R2 URL that serves the PDF bytes', async ({
    page,
  }) => {
    const fileUrl = `/api/files/${attachmentId}`;

    // Log in first — the route requires an authenticated session.
    await loginAs(page, 'buyer');

    // (1) Direct, non-following request against the route itself: assert the
    // 302 + signed-URL shape without letting Playwright chase the redirect.
    const redirectRes = await page.request.get(fileUrl, { maxRedirects: 0 });
    expect(redirectRes.status()).toBe(302);
    const location = redirectRes.headers()['location'];
    expect(location).toBeTruthy();
    const locationUrl = new URL(location!);
    expect(locationUrl.hostname).toMatch(/r2\.cloudflarestorage\.com$/);
    expect(locationUrl.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(redirectRes.headers()['cache-control']).toBe('private, no-store');

    // (2) Follow the redirect for real (default maxRedirects) — proves the
    // signature is valid against the actual bucket, not just shaped right.
    const followedRes = await page.request.get(fileUrl);
    expect(followedRes.status()).toBe(200);
    expect(followedRes.headers()['content-type']).toBe('application/pdf');
    const body = await followedRes.body();
    expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // (3) UI contract — the iframe still mounts with the route URL (not the
    // R2 URL) as its src; the client never sees the presigned URL directly.
    await page.goto(`/rfp/${RFP_ID}`);
    await page.getByRole('tab', { name: /서포터 B 페이/ }).click();
    await page.getByRole('button', { name: /제안서 PDF/ }).click();
    const iframe = page.locator(`iframe[src*="${fileUrl}"]`);
    await expect(iframe).toBeVisible();
  });
});
