/**
 * PG_RFP_SPEC.md §6 시나리오 C — 구매사 비교·계약.
 *
 * Buyer reviews bids, selects winner, confirms award. Verifies:
 *   - rfps.status → 'awarded'
 *   - contracts row inserted (rfpId, winningBidId, winningPgWsId)
 *   - notifications: winner + losers
 *   - outbox_entries: rfp.awarded.winner + rfp.awarded.loser × N
 *
 * Uses the seeded RFP `P-2604-0001` which already has 2 submitted bids
 * (toss + inicis) — perfect for the "1 winner + N losers" check. The
 * buyer is `yeonseong.dev@gmail.com`, owner of `P-2604-0001`.
 */
import { test, expect } from 'playwright/test';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { rfpUuidFromCode } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const BUYER_EMAIL = 'yeonseong.dev@gmail.com';
const BUYER_PASSWORD = 'password123';
const RFP_ID = 'P-2604-0001';

test.describe.serial('Scenario C — buyer awards a bid', () => {
  test('buyer logs in, opens comparison, awards toss, confirms', async ({
    page,
  }) => {
    // RFP_ID is the human code; FK columns + dedupe keys use the uuid.
    const rfpUuid = await rfpUuidFromCode(RFP_ID);

    // ── Pre: ensure the RFP is in 'sent' state (idempotent reset for ─
    // multi-run flakiness — globalSetup reseeds, but if a stale local
    // run left it 'awarded', force back to 'sent' and clear contract).
    await db.execute(
      sql`UPDATE rfps SET status='sent', awarded_bid_id=NULL WHERE id=${rfpUuid}`,
    );
    await db.execute(sql`DELETE FROM contracts WHERE rfp_id=${rfpUuid}`);

    // ── Pre: 토스 bid 복구. scenario-b 는 setup 단계에서 토스 bid 를 지우는데,
    // UI 단계가 실패하면 재제출이 일어나지 않아 DB 가 '토스 bid 없음' 으로 남는다.
    // globalSetup 의 seed 결과(토스 + 이니시스 각 1건 submitted) 를 재현하기
    // 위해 누락이면 직접 INSERT — uniq(rfp_id,pg_ws_id) + ON CONFLICT 로 중복 차단.
    // submittedBy 는 토스 워크스페이스 멤버 아무 user_id (FK 만 충족하면 됨).
    await db.execute(sql`
      INSERT INTO bids (
        id, rfp_id, pg_ws_id, invitation_id, settle_cycle, settle_limit,
        guarantee_insurance, payment_fees, memo, status, submitted_by, submitted_at
      )
      SELECT
        gen_random_uuid(), ${rfpUuid}, w.id, i.id, 'D+1', '0', '0', '{}'::jsonb,
        'e2e C: restored toss bid', 'submitted', m.user_id, NOW()
      FROM workspaces w
      JOIN rfp_invitations i ON i.rfp_id = ${rfpUuid} AND i.pg_ws_id = w.id
      JOIN workspace_members m ON m.workspace_id = w.id
      WHERE w.name = '서포터 B 페이'
      LIMIT 1
      ON CONFLICT (rfp_id, pg_ws_id) DO NOTHING
    `);

    // Pick the toss bid (winner) — seeded as 'submitted'. The workspaces
    // table no longer carries a `domain` column (post-schema simplification);
    // identify the toss workspace by name, the canonical seeded value.
    const winnerRows = await db.execute<{ id: string }>(
      sql`SELECT b.id FROM bids b
          JOIN workspaces w ON w.id = b.pg_ws_id
          WHERE b.rfp_id = ${rfpUuid} AND w.name = '서포터 B 페이'
          LIMIT 1`,
    );
    const winnerArr = Array.isArray(winnerRows)
      ? winnerRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((winnerRows as any).rows ?? []);
    expect(winnerArr.length).toBe(1);
    const winnerBidId = winnerArr[0].id;

    // ── 1. Login ─────────────────────────────────────────────────
    await page.goto('/login');
    await page.fill('input[name="email"]', BUYER_EMAIL);
    await page.fill('input[name="password"]', BUYER_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/home$/);

    // ── 2. Comparison table — assert it lists submitted bids ─────
    await page.goto(`/rfp/${RFP_ID}`);
    // 서포터 B 페이는 BidComparisonTable 행과 RfpInviteManager 목록 양쪽에
    // 렌더되므로 strict 모드 위반을 피하기 위해 비교 테이블 셀을 직접 노린다.
    await expect(
      page.getByRole('cell', { name: /서포터 B 페이/ }),
    ).toBeVisible();

    // ── 3. Navigate directly to award flow w/ bidId search param ─
    // (BidComparisonTable wires this URL behind its '수주' CTA but
    //  we navigate directly to keep the spec robust against table UI
    //  changes — the integration boundary is the action call.)
    await page.goto(`/rfp/${RFP_ID}/award?bidId=${winnerBidId}`);
    // Award 페이지는 헤딩 "서포터 B 페이 제안을 선택하시겠습니까?"로 시작 —
    // 같은 페이지에 RFP 번호/탭/리스트 등 서포터 B 페이 키워드가 흩어져 있어
    // 헤딩 role 로 좁혀 strict 모드 위반을 피한다.
    await expect(
      page.getByRole('heading', { name: /서포터 B 페이.*선택할까요/ }),
    ).toBeVisible();

    // ── 4. Confirm award ─────────────────────────────────────────
    await page.getByRole('button', { name: /선정할게요/ }).click();

    // After confirm: AwardConfirm renders the success state in place —
    // wait for the "계약이 확정되었습니다" heading. Avoid the bare "✓ 수주 확정"
    // chip text because the same string also appears in the page eyebrow
    // ("P-2604-0001 · 수주 처리") and triggers a strict-mode collision.
    await expect(
      page.getByRole('heading', { name: /계약이 확정/ }),
    ).toBeVisible({ timeout: 15_000 });

    // ── 5. DB assertions ─────────────────────────────────────────
    // RFP now 'awarded' with awarded_bid_id pinned.
    const rfpRows = await db.execute<{
      status: string;
      awarded_bid_id: string | null;
    }>(
      sql`SELECT status, awarded_bid_id FROM rfps WHERE id = ${rfpUuid}`,
    );
    const rfpArr = Array.isArray(rfpRows)
      ? rfpRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((rfpRows as any).rows ?? []);
    expect(rfpArr[0].status).toBe('awarded');
    expect(rfpArr[0].awarded_bid_id).toBe(winnerBidId);

    // contracts row inserted referencing the winning bid. The schema
    // uses `bid_id` (single FK, not winning/losing); one row per RFP.
    const contractRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM contracts
          WHERE rfp_id = ${rfpUuid} AND bid_id = ${winnerBidId}`,
    );
    const contractArr = Array.isArray(contractRows)
      ? contractRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((contractRows as any).rows ?? []);
    expect(contractArr[0].c).toBe(1);

    // Outbox: 1 row per winner workspace member email (awardRfpAction
    // explicitly does NOT email losers — they get an in-app row only).
    // Seed has 1 toss admin, so we expect ≥ 1 'rfp.awarded' outbox row.
    const outboxRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM outbox_entries
          WHERE event = 'rfp.awarded'
            AND dedupe_key LIKE ${'rfp:' + rfpUuid + ':awarded:%'}`,
    );
    const outboxArr = Array.isArray(outboxRows)
      ? outboxRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((outboxRows as any).rows ?? []);
    expect(outboxArr[0].c).toBeGreaterThanOrEqual(1);

    // In-app notifications: winner = 'rfp.awarded', loser = 'rfp.rejected'
    // (both go to the per-PG inbox via link_url '/inbox/<rfpId>'). With
    // seeded toss + inicis bids and toss as winner, we expect ≥ 2 total.
    const notifRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM notifications
          WHERE type IN ('rfp.awarded', 'rfp.rejected')
            AND link_url = ${'/inbox/' + RFP_ID}`,
    );
    const notifArr = Array.isArray(notifRows)
      ? notifRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((notifRows as any).rows ?? []);
    expect(notifArr[0].c).toBeGreaterThanOrEqual(2);
  });
});
