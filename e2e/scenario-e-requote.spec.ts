/**
 * Scenario E — 견적 재요청 → 재제출.
 *
 * 구매사 side: buyer login is known-broken in the local/test env (pre-existing
 * Auth.js quirk — scenario-c also fails at buyer login). To keep this spec
 * deterministic we seed the requote request row directly via SQL (equivalent
 * to the buyer having sent it), then exercise the PG-facing flow end-to-end.
 *
 * Phase 1 (DB seed, no buyer UI):
 *   - Ensure toss round-1 bid exists on P-2604-0001
 *   - INSERT rfp_requote_requests (round=2, status=pending) for toss PG
 *
 * Phase 2 (PG toss — full UI):
 *   - Login as ws-toss-admin@example.com
 *   - /inbox/<code> → assert '견적 재요청을 받았어요' banner
 *   - Fill the BidWizard (re-submission with improved rates)
 *   - Assert: bids row with round=2, rfp_requote_requests.status='responded'
 *
 * Uses the seeded RFP P-2604-0001 (same as scenario-b/c).
 */
import { test, expect } from 'playwright/test';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { bids, workspaces } from '@/lib/db/schema';
import { rfpUuidFromCode } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const TOSS_EMAIL = 'ws-toss-admin@example.com';
const TOSS_PASSWORD = 'password123';
const RFP_CODE = 'P-2604-0001';

test.describe.serial('Scenario E — 재요청 → 재제출', () => {
  test('requote banner shows; toss PG sees banner and resubmits round 2', async ({ page }) => {
    const rfpUuid = await rfpUuidFromCode(RFP_CODE);

    // ── Pre-seed: idempotent reset ───────────────────────────────────────
    // 1. RFP → sent (clear any previous award)
    await db.execute(
      sql`UPDATE rfps SET status='sent', awarded_bid_id=NULL WHERE id=${rfpUuid}`,
    );
    await db.execute(sql`DELETE FROM contracts WHERE rfp_id=${rfpUuid}`);

    // 2. Clear any leftover requote requests from prior runs
    await db.execute(sql`DELETE FROM rfp_requote_requests WHERE rfp_id=${rfpUuid}`);

    // 3. Look up toss workspace
    const [tossWsRow] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, '서포터 B 페이'))
      .limit(1);
    expect(tossWsRow).toBeDefined();
    const tossWsId = tossWsRow.id;

    // 4. Clear any existing toss bids (we need round-1 only, clean state)
    await db
      .delete(bids)
      .where(and(eq(bids.rfpId, rfpUuid), eq(bids.pgWsId, tossWsId)));

    // 5. Ensure toss round-1 bid exists. ON CONFLICT (rfp_id, pg_ws_id, round) DO NOTHING.
    await db.execute(sql`
      INSERT INTO bids (
        id, rfp_id, pg_ws_id, invitation_id, round, settle_cycle, settle_limit,
        guarantee_insurance, payment_fees, memo, status, submitted_by, submitted_at
      )
      SELECT
        gen_random_uuid(), ${rfpUuid}, w.id, i.id, 1, 'D+1', '0', '0', '{}'::jsonb,
        'e2e E: seed round-1 toss bid', 'submitted', m.user_id, NOW()
      FROM workspaces w
      JOIN rfp_invitations i ON i.rfp_id = ${rfpUuid} AND i.pg_ws_id = w.id
      JOIN workspace_members m ON m.workspace_id = w.id
      WHERE w.name = '서포터 B 페이'
      LIMIT 1
      ON CONFLICT (rfp_id, pg_ws_id, round) DO NOTHING
    `);

    // 6. Seed the requote request (as if buyer sent it via UI). round=2, status=pending.
    //    buyer user_id comes from workspace_members of the buyer workspace.
    await db.execute(sql`
      INSERT INTO rfp_requote_requests (
        id, rfp_id, pg_ws_id, round, message, deadline, status, created_by_user_id, created_at
      )
      SELECT
        gen_random_uuid(),
        ${rfpUuid},
        ${tossWsId},
        2,
        '카드 수수료를 0.1%p만 더 낮춰주세요. e2e E seed.',
        NOW() + INTERVAL '3 days',
        'pending',
        m.user_id,
        NOW()
      FROM workspaces w
      JOIN workspace_members m ON m.workspace_id = w.id
      WHERE w.type = 'buyer'
      LIMIT 1
    `);

    // Verify the seed landed correctly
    const seededRows = await db.execute<{ id: string; round: number; status: string }>(
      sql`SELECT id, round, status FROM rfp_requote_requests WHERE rfp_id=${rfpUuid}`,
    );
    const seededArr = Array.isArray(seededRows)
      ? seededRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((seededRows as any).rows ?? []);
    expect(seededArr).toHaveLength(1);
    expect(seededArr[0].round).toBe(2);
    expect(seededArr[0].status).toBe('pending');
    const requoteId = seededArr[0].id;

    // ── Phase 2: PG (toss) — sees banner, resubmits ──────────────────────

    // 2a. Login as toss PG
    await page.goto('/login');
    await page.fill('input[name="email"]', TOSS_EMAIL);
    await page.fill('input[name="password"]', TOSS_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });

    // 2b. Navigate to inbox
    await page.goto(`/inbox/${RFP_CODE}`);
    await page.waitForURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 15_000 });

    // 2c. Assert the requote banner is visible
    await expect(page.getByText(/견적 재요청을 받았어요/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/카드 수수료를 0.1%p만 더 낮춰주세요/)).toBeVisible();

    // 2d. Fill the BidWizard — step 1: 정산 조건
    await page.locator('select').first().selectOption('D');
    await page.locator('input[type="number"]').first().fill('1');
    await page.getByRole('button', { name: '수수료', exact: true }).click();

    // 2e. Step 2: 수수료 — fill all visible PercentInput placeholders
    const feePctInputs = page.getByPlaceholder('0.00');
    const feeInputs = await feePctInputs.all();
    expect(feeInputs.length).toBeGreaterThan(0);
    for (const feeInput of feeInputs) {
      await feeInput.fill('0.40'); // improved rate vs round-1
    }
    await page.getByRole('button', { name: '견적서', exact: true }).click();

    // 2f. Step 3: 견적서 (메모)
    await page
      .getByPlaceholder(/추가 안내 사항이 있으면/)
      .fill('e2e E: round 2 개선 견적 — 수수료 0.4%로 인하');
    await page.getByRole('button', { name: '검토·발송', exact: true }).click();

    // 2g. Step 4: 검토·발송 → ConfirmDialog → 견적 보내기
    await page.getByRole('button', { name: /^견적 보내기$/ }).first().click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /견적 보내기/ })
      .click();
    await page.waitForURL(new RegExp(`/inbox/${RFP_CODE}/submitted$`), {
      timeout: 15_000,
    });

    // 2h. Confirm submitted page loaded
    await expect(
      page.getByRole('heading', { name: /견적을 보냈어요/ }),
    ).toBeVisible({ timeout: 15_000 });

    // ── DB assertions ─────────────────────────────────────────────────────

    // bids: should have a round=2 row for toss PG with status='submitted'
    const bidRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM bids b
          JOIN workspaces w ON w.id = b.pg_ws_id
          WHERE b.rfp_id = ${rfpUuid}
            AND w.name = '서포터 B 페이'
            AND b.round = 2
            AND b.status = 'submitted'`,
    );
    const bidArr = Array.isArray(bidRows)
      ? bidRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((bidRows as any).rows ?? []);
    expect(bidArr[0].c).toBe(1);

    // rfp_requote_requests: status should be 'responded' after resubmission
    const updatedRequoteRows = await db.execute<{ status: string }>(
      sql`SELECT status FROM rfp_requote_requests WHERE id = ${requoteId}`,
    );
    const updatedRequoteArr = Array.isArray(updatedRequoteRows)
      ? updatedRequoteRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((updatedRequoteRows as any).rows ?? []);
    expect(updatedRequoteArr).toHaveLength(1);
    expect(updatedRequoteArr[0].status).toBe('responded');
  });
});
