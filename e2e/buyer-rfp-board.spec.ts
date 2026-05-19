/**
 * Buyer kanban board — DB-backed roundtrip (Stage 3 cutover verification).
 *
 * Pre-Stage 3 the kanban persisted to localStorage (Zustand `bid-board:v1`).
 * After the server cutover (Stage 3c), drag/drop hits `updateBuyerStageAction`
 * → `bids.buyer_stage`. This spec asserts the actual server roundtrip:
 *   1. Toggle to board, verify all bids start in 진행전 (seed default).
 *   2. Drag inicis card to 협상중.
 *   3. Reload the page (kills any optimistic React state).
 *   4. DB row for the inicis bid is now `buyer_stage='negotiating'`.
 *   5. UI re-renders inicis under 협상중.
 */
import { test, expect } from 'playwright/test';

import {
  findSeededBidIds,
  getBuyerStageFromDb,
  loginAs,
  resetRfpForKanban,
} from './_helpers';

const RFP_ID = 'P-2604-0001';

test.describe.serial('Buyer kanban board (DB-backed)', () => {
  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
  });

  test('drag inicis → 협상중, reload, position holds via DB', async ({
    page,
  }) => {
    const { inicis: inicisBidId } = await findSeededBidIds(RFP_ID);

    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_ID}`);

    // 1. Toggle to board view.
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();
    await expect(page.getByText('진행전').first()).toBeVisible();
    await expect(page.getByText('협상중').first()).toBeVisible();
    await expect(page.getByText('결정').first()).toBeVisible();

    // 2. Drag inicis to 협상중. Cards render as <button>s by PG name.
    const inicisCard = page.getByRole('button', { name: /이니시스/ }).first();
    const negotiatingHeader = page.getByText('협상중').first();
    await inicisCard.dragTo(negotiatingHeader);

    // 3. Wait for the server commit. dragTo only fires DOM events; the
    //    `commitStage` handler then runs updateBuyerStageAction inside a
    //    transition. Reloading before that POST resolves races with the
    //    RSC fetch and flakes. Poll the DB until the column is persisted.
    await expect
      .poll(() => getBuyerStageFromDb(inicisBidId), { timeout: 5_000 })
      .toBe('negotiating');

    // 4. Reload — proves the new state really came from the server via
    //    RSC, not an optimistic overlay still hanging around.
    await page.reload();
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();

    // 5. UI re-render — inicis card is *inside* the negotiating column.
    //    BidBoardColumn renders `data-stage="<stage>"` on its root for
    //    exactly this kind of stable test traversal.
    await expect(
      page
        .locator('[data-stage="negotiating"]')
        .getByRole('button', { name: /이니시스/ }),
    ).toBeVisible();
  });
});
