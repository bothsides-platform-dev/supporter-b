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

test.describe.serial('FocusComparison 내 메모 — note roundtrip (Stage 3)', () => {
  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
  });

  test('add memo + PDF attachment, persists across reload, then delete', async ({
    page,
  }) => {
    const { toss: tossBidId } = await findSeededBidIds(RFP_ID);

    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_ID}`);
    // 서포터 B 페이 탭으로 포커스 → '내 메모' 아코디언 펼침 → BidNotesPanel.
    await page.getByRole('tab', { name: /서포터 B 페이/ }).click();
    await page.getByRole('button', { name: '내 메모' }).click();

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
    await page.getByRole('tab', { name: /서포터 B 페이/ }).click();
    await page.getByRole('button', { name: '내 메모' }).click();

    await expect(
      page.getByText('e2e: 본사 컨펌 후 회신 예정'),
    ).toBeVisible();
    // Attachment chip rendered with the original filename.
    await expect(page.getByText('e2e-memo.pdf')).toBeVisible();

    // Now delete the note. 삭제 UI 는 2-step:
    //   (1) 노트 항목의 '삭제' 버튼 → ConfirmDialog("메모를 삭제할까요?") 오픈
    //   (2) 다이얼로그 안의 '삭제' 확인 버튼 → 실제 deleteBidNoteAction 호출
    // 첫 클릭만으로는 noteCountFromDb 가 줄지 않는다(다이얼로그 미확인 상태).
    await page.getByRole('button', { name: '삭제' }).first().click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '삭제' })
      .click();

    await expect
      .poll(() => getNoteCountFromDb(tossBidId), { timeout: 5_000 })
      .toBe(0);

    // Reload to ensure the row is really gone from the server view.
    await page.reload();
    await page.getByRole('tab', { name: /서포터 B 페이/ }).click();
    await page.getByRole('button', { name: '내 메모' }).click();
    await expect(
      page.getByText(/아직 기록된 메모가 없습니다/),
    ).toBeVisible();
  });
});
