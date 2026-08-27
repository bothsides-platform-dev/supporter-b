/**
 * Scenario E — 견적 재요청 → 재제출.
 *
 * 구매사 side: 재요청 행을 buyer UI 로 만들지 않고 SQL 로 심는다(구매사가 보낸 것과
 * 동등한 상태) — 이 스펙의 대상은 PG 쪽 여정이고, 앞 단계를 UI 로 걸으면 실패 지점이
 * 두 배가 된다. (옛 주석은 "buyer 로그인이 로컬에서 깨져 있다 / scenario-c 도 buyer
 * 로그인에서 실패한다"고 적었지만 둘 다 사실이 아니다 — scenario-c 는 초록이다.)
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
import { loginAs, rfpUuidFromCode } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const RFP_CODE = 'P-2604-0001';

test.describe.serial('Scenario E — 재요청 → 재제출', () => {
  // The BidWizard re-submission flow accumulates ~30 s under cold conditions.
  // Give the test 90 s to avoid a brittle boundary failure.
  test.setTimeout(90_000);

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
        gen_random_uuid(), ${rfpUuid}, w.id, i.id, 1, 'D+1', '50000000', '0', '{}'::jsonb,
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
    await loginAs(page, 'pg-toss');

    // 2b. Navigate to inbox
    await page.goto(`/inbox/${RFP_CODE}`);
    await page.waitForURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 45_000 });

    // 2c. Assert the requote banner is visible
    await expect(page.getByText(/견적 재요청을 받았어요/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/카드 수수료를 0.1%p만 더 낮춰주세요/)).toBeVisible();

    // 2d. Fill the BidWizard — step 1: 정산 조건
    // 옵션으로 식별한다 — 견적 템플릿이 있으면 step1 의 첫 <select> 는 템플릿 피커다
    // (BidWizard:470-497).
    await page.locator('select:has(option[value="D"])').selectOption('D');
    // cycleNum 은 NumericFormat(type=text, placeholder="1") — 구 input[type=number]
    // 셀렉터(cf98414 NumericFormat 전환 이후 stale)를 placeholder 매칭으로 교체.
    await page.getByPlaceholder('1', { exact: true }).fill('1');
    // 정산한도는 0 초과 필수다(bid-wizard-validation:47-49). 재요청 위저드는 직전
    // 라운드 값을 프리필하지만(BidWizard:97) 개선 제안이므로 명시적으로 올려 쓴다 —
    // 프리필에 기대면 "무엇을 보냈는지"가 시드에 숨는다.
    await page.getByPlaceholder('50,000,000').fill('80000000');
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
    // 이름으로 좁힌다 — 토스트도 role="dialog" 라(base-ui Toast) 이름 없이 잡으면
    // 살아 있는 토스트와 strict-mode 충돌이 난다.
    const confirmDialog = page.getByRole('dialog', { name: '견적을 보낼까요?' });
    // 확인창 자체를 먼저 단언 — 1단계 필수값이 비면 확인창이 아예 안 열린다
    // (BidWizard:280-295). 그때 '버튼 없음'이 아니라 '창 안 열림'으로 죽어야 읽힌다.
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await confirmDialog.getByRole('button', { name: /견적 보내기/ }).click();

    // 2h. 인플레이스 제출 완료 — 별도 /submitted 로 이탈하지 않고 같은 창에서 갱신.
    await expect(page.getByText(/견적을 보냈어요/)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`));

    // ── DB assertions ─────────────────────────────────────────────────────

    // bids: should have a round=2 row for toss PG with status='submitted'
    const bidRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM bids b
          JOIN workspaces w ON w.id = b.pg_ws_id
          WHERE b.rfp_id = ${rfpUuid}
            AND w.name = '서포터 B 페이'
            AND b.round = 2
            AND b.status = 'submitted'
            AND b.settle_limit = 80000000`,
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
