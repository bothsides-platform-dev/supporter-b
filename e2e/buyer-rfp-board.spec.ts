/**
 * Buyer RFP bid board — DB-backed placement roundtrip (unified kanban cutover).
 *
 * The board moved from `bids.buyer_stage` to the unified columns +
 * `bid_placements` model. Dropping a bid card onto a custom column ("협상중")
 * writes a `bid_placements` row via `moveCardAction`; the card resolves into
 * that column on the next RSC fetch. There is no per-card menu anymore — moves
 * are drag-only — so this spec drives @dnd-kit drag via Playwright and verifies
 * the persisted placement through the DB before reloading.
 *   1. Toggle to the board, verify the seeded columns mount.
 *   2. Drag the inicis bid card onto the 협상중 column.
 *   3. Poll the DB until the placement resolves to 협상중.
 *   4. Reload (kills optimistic React state); card re-renders under 협상중.
 *
 * NOTE: requires the 5433 test DB (`pnpm e2e`). @dnd-kit drag under Playwright
 * synthetic pointer events can need step tuning; the DB poll is the source of
 * truth for the move.
 */
import { test, expect } from 'playwright/test';

import {
  findSeededBidIds,
  getBidColumnTitleFromDb,
  loginAs,
  resetRfpForKanban,
} from './_helpers';

const RFP_ID = 'P-2604-0001';

test.describe.serial('Buyer RFP bid board (DB-backed placements)', () => {
  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
  });

  test('drag inicis → 협상중, placement persists, holds after reload', async ({ page }) => {
    const { inicis: inicisBidId } = await findSeededBidIds(RFP_ID);

    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_ID}`);

    // 1. Toggle to board view; columns mount.
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();
    await expect(page.locator('[data-column-title="진행전"]')).toBeVisible();
    const negotiating = page.locator('[data-column-title="협상중"]');
    await expect(negotiating).toBeVisible();
    await expect(page.locator('[data-column-title="결정"]')).toBeVisible();

    // 2. Drag the inicis card onto the 협상중 column.
    const card = page
      .locator('[data-column-title="진행전"] button')
      .filter({ hasText: '이니시스' });
    await card.dragTo(negotiating);

    // 3. The drop fires moveCardAction inside a transition — poll the DB until
    //    the placement resolves to 협상중 rather than racing the RSC refetch.
    await expect
      .poll(() => getBidColumnTitleFromDb(inicisBidId), { timeout: 5_000 })
      .toBe('협상중');

    // 4. Reload — proves the move came from the server, not an optimistic
    //    overlay; the card renders inside the 협상중 column.
    await page.reload();
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();
    await expect(
      page.locator('[data-column-title="협상중"] button').filter({ hasText: '이니시스' }),
    ).toBeVisible();
  });
});
