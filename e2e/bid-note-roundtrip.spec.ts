/**
 * BidDetailModal note add/remove roundtrip — Stage 3 user path.
 *
 * Pre-Stage 3, notes lived in localStorage (lib/stores/bid-board.ts). After
 * the server cutover this is the full chain we want covered end-to-end:
 *
 *   NoteForm → eager /api/files/upload (bid_note draft, ownerId=bidId)
 *            → addBidNoteAction (note row + owner_id patch in one tx)
 *            → router.refresh() → RSC re-fetch
 *
 *   Timeline → removeBidNoteAction → router.refresh()
 *
 * Spec exercises both create and delete with the DB as the assertion of
 * record — UI visibility is a secondary check.
 */
import { test, expect } from 'playwright/test';

import {
  findSeededBidIds,
  getNoteCountFromDb,
  loginAs,
  resetRfpForKanban,
} from './_helpers';

const RFP_ID = 'P-2604-0001';
const SAMPLE_PDF = Buffer.from(
  ['%PDF-1.4', '%%EOF', ''].join('\n'),
  'utf8',
);

test.describe.serial('BidDetailModal — note roundtrip (Stage 3)', () => {
  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
  });

  test('add memo + PDF attachment, persists across reload, then delete', async ({
    page,
  }) => {
    const { toss: tossBidId } = await findSeededBidIds(RFP_ID);

    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_ID}`);
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();

    // Open the toss bid modal.
    await page.getByRole('button', { name: /서포터 B 페이/ }).first().click();

    // Fill body + attach a tiny PDF. NoteForm uploads eagerly on file
    // pick — wait for the /api/files/upload success before clicking 기록.
    const uploadResp = page.waitForResponse(
      (r) =>
        r.url().includes('/api/files/upload') &&
        r.request().method() === 'POST',
    );
    await page.setInputFiles('input[type="file"]', {
      name: 'e2e-memo.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF,
    });
    const uploadRes = await uploadResp;
    expect(uploadRes.status()).toBe(200);

    await page.getByPlaceholder(/협상 진행/).fill('e2e: 본사 컨펌 후 회신 예정');
    await page.getByRole('button', { name: '기록' }).click();

    // DB-of-record assertion — the note row landed. addBidNoteAction returns
    // before router.refresh() resolves, so the count may take a beat to
    // observe; Playwright's expect.poll handles that.
    await expect
      .poll(() => getNoteCountFromDb(tossBidId), { timeout: 5_000 })
      .toBe(1);

    // Full reload + reopen — proves the data really came back from the DB
    // via RSC, not from any optimistic client state.
    await page.reload();
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();
    await page.getByRole('button', { name: /서포터 B 페이/ }).first().click();

    await expect(
      page.getByText('e2e: 본사 컨펌 후 회신 예정'),
    ).toBeVisible();
    // Attachment chip rendered with the original filename.
    await expect(page.getByText('e2e-memo.pdf')).toBeVisible();

    // Now delete the note. Multiple 삭제 buttons may exist in the future
    // (timeline of notes); for this spec we only have one note, so first()
    // is unambiguous.
    await page.getByRole('button', { name: '삭제' }).first().click();

    await expect
      .poll(() => getNoteCountFromDb(tossBidId), { timeout: 5_000 })
      .toBe(0);

    // Reload to ensure the row is really gone from the server view.
    await page.reload();
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();
    await page.getByRole('button', { name: /서포터 B 페이/ }).first().click();
    await expect(
      page.getByText(/아직 기록된 메모가 없습니다/),
    ).toBeVisible();
  });
});
