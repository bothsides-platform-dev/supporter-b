/**
 * PG_RFP_SPEC.md §6 시나리오 B — PG 제안 응답.
 *
 * Toss PG admin claims a pending invitation and submits a bid. Verifies:
 *   - bids row inserted (status='submitted', pgWsId=tossWs)
 *   - notifications row for buyer (bid.submitted)
 *   - outbox_entries row event_type='bid.submitted'
 *   - UI: lands on /inbox/<rfpId>/submitted
 *
 * Token strategy
 * --------------
 * Seed stores only token *hashes* (sha256). To exercise the public
 * `/invite/rfp/:token` claim flow we mint a fresh raw token for the
 * existing pending toss invitation on `P-2604-0001`, persist its hash,
 * and use the raw token in the URL. We log in as toss admin
 * (the seeded `ws-toss-admin@toss.im`) — `claimToken` resolves the
 * invitation to the toss PG workspace via workspaceId check.
 *
 * Note: scenario A's seeded RFP `P-2604-0001` already has 2 submitted
 * bids (toss + inicis from seed) — but those reference fixed pgWsIds
 * that match our login. The RFP has UNIQUE (rfpId, pgWsId) on bids, so
 * the form will reject our submission. We side-step by clearing the
 * existing toss bid before navigating to the inbox.
 */
import { test, expect } from 'playwright/test';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { rfpInvitations, bids, workspaces } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/server/token';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const TOSS_EMAIL = 'ws-toss-admin@toss.im';
const TOSS_PASSWORD = 'password123';
const RFP_ID = 'P-2604-0001';

test.describe.serial('Scenario B — PG submits a bid', () => {
  test('toss claims invitation, submits bid, lands on submitted page', async ({
    page,
  }) => {
    // ── Look up toss workspace by name ───────────────────────────
    const [tossWsRow] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, '서포터 B 페이'))
      .limit(1);
    expect(tossWsRow).toBeDefined();
    const tossWsId = tossWsRow.id;

    // ── Pre: clear toss's seeded bid so submission is permitted. ──
    // (Constraint: unique on (rfp_id, pg_ws_id).)
    await db
      .delete(bids)
      .where(
        and(
          eq(bids.rfpId, RFP_ID),
          eq(bids.pgWsId, tossWsId),
        ),
      );

    // ── Pre: rotate toss invitation token to a known plaintext. ───
    const rawToken = generateToken();
    await db
      .update(rfpInvitations)
      .set({
        tokenHash: hashToken(rawToken),
        status: 'pending',
        acceptedByUserId: null,
      })
      .where(
        and(
          eq(rfpInvitations.rfpId, RFP_ID),
          eq(rfpInvitations.pgWsId, tossWsId),
        ),
      );

    // ── 1. Pre-login as toss admin ───────────────────────────────
    // InviteUnauthClient now routes unauthenticated invite visitors into
    // the /signup/pg/verify funnel (first-time PG onboarding). The toss
    // admin already exists, so we log in first and exercise the
    // InviteAuthedClient path that claims via claimInviteTokenAction
    // and redirects straight to /inbox/<rfpId>.
    await page.goto('/login');
    await page.fill('input[name="email"]', TOSS_EMAIL);
    await page.fill('input[name="password"]', TOSS_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await page.waitForURL(/\/home$/, { timeout: 15_000 });

    // ── 2. Visit invite URL while logged in ──────────────────────
    await page.goto(`/invite/rfp/${rawToken}`);

    // ── 3. Land on /inbox/<rfpId> ────────────────────────────────
    await page.waitForURL(new RegExp(`/inbox/${RFP_ID}$`), {
      timeout: 15_000,
    });

    // ── 4. Fill the BidForm ──────────────────────────────────────
    // sme2 grade ⇒ card fees by issuer are STATUTORY and the form
    // disables the 9-card panel. We just fill the negotiable fields.
    // Selects use native <select>; numeric inputs are font-mono.
    await page.locator('select').first().selectOption('D+1');

    // Numeric placeholders are unique enough to target. Order in form
    // is: deposit, setupFee, monthlyMin, bankPct(1.50), easyPayPct(1.80),
    // overseasPct(3.00).
    await page.getByPlaceholder('1.50').first().fill('0.50');
    await page.getByPlaceholder('1.80').first().fill('2.50');

    await page
      .getByPlaceholder(/추가 안내 사항이 있으면/)
      .fill('e2e B: D+1, bank 0.5%, easy 2.5%');

    // ── 5. Submit ────────────────────────────────────────────────
    // 액션 성공 → /inbox/<rfpId>/submitted로 redirect되어야 한다.
    // (server action에서 revalidatePath + client에서 router.push,
    //  router.push + router.refresh 동시 호출은 Next 16 useTransition
    //  hang 패턴이라 금지 — vercel/next.js#86055 참조.)
    await page.getByRole('button', { name: /제안 제출/ }).click();
    await page.waitForURL(new RegExp(`/inbox/${RFP_ID}/submitted$`), {
      timeout: 15_000,
    });

    // ── 6. DB-of-record: bid row inserted with status='submitted' ──
    const bidRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM bids
          WHERE rfp_id = ${RFP_ID}
            AND pg_ws_id = ${tossWsId}
            AND status = 'submitted'`,
    );
    const bidArr = Array.isArray(bidRows)
      ? bidRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((bidRows as any).rows ?? []);
    expect(bidArr[0].c).toBe(1);

    // Buyer notification fired (bid.submitted → buyer workspace).
    // notifications schema carries `type` (text) + `link_url` — no JSONB
    // payload; the link encodes rfpId so we filter on it.
    const notifRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM notifications
          WHERE type = 'bid.submitted'
            AND link_url = ${'/rfp/' + RFP_ID}`,
    );
    const notifArr = Array.isArray(notifRows)
      ? notifRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((notifRows as any).rows ?? []);
    expect(notifArr[0].c).toBeGreaterThanOrEqual(1);

    // Outbox enqueued the bid.submitted email to buyer admin. dedupeKey
    // is `bid:{rfpId}:{pgWsId}:{userId}` (submitBidAction).
    const outboxRows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM outbox_entries
          WHERE event = 'bid.submitted'
            AND dedupe_key LIKE ${'bid:' + RFP_ID + ':%'}`,
    );
    const outboxArr = Array.isArray(outboxRows)
      ? outboxRows
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((outboxRows as any).rows ?? []);
    expect(outboxArr[0].c).toBeGreaterThanOrEqual(1);

    // /submitted 페이지의 헤딩으로 redirect 후 RSC 렌더링 완료를 검증.
    // 같은 페이지에 "✓ 제출 완료" 에어브로우 paragraph가 또 있어 strict-mode
    // 위반을 피하려면 heading role로 좁혀야 한다.
    await expect(
      page.getByRole('heading', { name: /제안이 제출/ }),
    ).toBeVisible();
  });
});
