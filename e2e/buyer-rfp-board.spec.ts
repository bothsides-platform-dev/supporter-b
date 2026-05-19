/**
 * Buyer kanban board — DB-backed stage-change roundtrip (Stage 3 cutover).
 *
 * Pre-Stage 3 the kanban persisted to localStorage (Zustand `bid-board:v1`).
 * After the server cutover (Stage 3c), stage moves hit
 * `updateBuyerStageAction` → `bids.buyer_stage`. The spec exercises the
 * card-menu path (per-card dropdown → "협상중으로") instead of the @dnd-kit
 * drag — the two share the same `commitStage` server-call boundary, but
 * Playwright's synthetic pointer events flake against @dnd-kit's
 * `PointerSensor activationConstraint` and the menu is the canonical
 * keyboard/a11y-friendly equivalent.
 *   1. Toggle to board, verify the three stage columns mount.
 *   2. Open the inicis card menu, choose "협상중으로".
 *   3. Poll the DB until `buyer_stage='negotiating'`.
 *   4. Reload the page (kills any optimistic React state).
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

    // 2. Move inicis card to 협상중 via the per-card dropdown menu.
    //    Drag (`@dnd-kit` PointerSensor) is too flaky under Playwright's
    //    synthetic events — different runs intermittently fail the
    //    `pointermove` activation threshold even with stepped moves. The
    //    menu path hits `onMoveStage(stage)` directly via the same
    //    `commitStage` → `updateBuyerStageAction` server call, so we still
    //    exercise the canonical write path the kanban relies on.
    await page.getByRole('button', { name: 'KG이니시스 메뉴' }).click();
    await page.getByRole('menuitem', { name: /협상중으로/ }).click();

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
    //    exactly this kind of stable test traversal. The card button
    //    carries `aria-roledescription="제안 카드, 드래그 가능"`; targeting
    //    that attribute avoids the per-card `KG이니시스 메뉴` dropdown trigger.
    await expect(
      page.locator(
        '[data-stage="negotiating"] button[aria-roledescription="제안 카드, 드래그 가능"]',
        { hasText: '이니시스' },
      ),
    ).toBeVisible();
  });
});
