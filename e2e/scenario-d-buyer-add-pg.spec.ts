/**
 * Scenario D — buyer adds PG to an already-sent RFP.
 *
 * 흐름:
 *   1. Buyer logs in, opens seed RFP `P-2604-0001` 상세.
 *   2. RfpInviteManager UI에서 신규 PG 이메일을 추가 — `[ 대기중 ]` 상태로 누적.
 *   3. "초대 발송" 클릭 → `[ 발송됨 ]`으로 전환 + 새 invitation row 생성 + outbox enqueue.
 *
 * Coverage:
 *   - addPgEmailsToRfpAction (status='draft', tokenHash placeholder).
 *   - sendDraftInvitationsAction (draft → pending DB enum, fresh tokenHash, outbox).
 *   - UI mounting via RfpInviteManager (status tags, button disabled state).
 */
import { test, expect } from 'playwright/test';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://bidit:bidit@localhost:5433/bidit_test';

const BUYER_EMAIL = 'yeonseong.dev@gmail.com';
const BUYER_PASSWORD = 'password123';
const RFP_ID = 'P-2604-0001';
const NEW_PG_EMAIL = 'newcomer@nicepay.co.kr';

test.describe.serial('Scenario D — buyer adds PG to existing RFP', () => {
  test('buyer adds PG email, drafts accumulate, send-drafts dispatches mail', async ({
    page,
  }) => {
    // ── 1. Login ─────────────────────────────────────────────────
    await page.goto('/login');
    await page.fill('input[name="email"]', BUYER_EMAIL);
    await page.fill('input[name="password"]', BUYER_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });

    // ── 2. Open seeded RFP detail ────────────────────────────────
    await page.goto(`/rfp/${RFP_ID}`);
    await expect(page.getByText('초대 PG')).toBeVisible();

    // Seed has 3 invitations: toss(accepted), inicis(accepted), kakao(pending).
    // Header shows "PG 3개사".
    await expect(page.getByText(/PG\s*3\s*개사/)).toBeVisible();

    // ── 3. Add a new PG email (chip-style input) ─────────────────
    await page.getByPlaceholder('sales@pg.com').fill(NEW_PG_EMAIL);
    await page.getByRole('button', { name: '추가' }).click();

    // ── 4. UI: 새 row가 [ 대기중 ] 상태로 표시 ─────────────────────
    await expect(page.getByText(NEW_PG_EMAIL)).toBeVisible();
    await expect(
      page.locator('text=/대기중/').first(),
    ).toBeVisible({ timeout: 10_000 });

    // DB assertion: invitation row inserted with status='draft'
    const draftRow = await db.execute<{ status: string; pg_email: string }>(
      sql`SELECT status::text AS status, pg_email FROM rfp_invitations
          WHERE rfp_id = ${RFP_ID}
            AND lower(pg_email) = lower(${NEW_PG_EMAIL})`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draftArr: any[] = Array.isArray(draftRow)
      ? draftRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((draftRow as any).rows ?? []);
    expect(draftArr).toHaveLength(1);
    expect(draftArr[0].status).toBe('draft');

    // Allowlist appended on the rfps row
    const allowRow = await db.execute<{ allowed: string[] }>(
      sql`SELECT allowed_pg_emails AS allowed FROM rfps WHERE id = ${RFP_ID}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allowArr: any[] = Array.isArray(allowRow)
      ? allowRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((allowRow as any).rows ?? []);
    expect(allowArr[0].allowed).toEqual(
      expect.arrayContaining([NEW_PG_EMAIL]),
    );

    // ── 5. Click "초대 발송" → outbox + status flip ────────────────
    const sendBtn = page.getByRole('button', { name: /개 PG에 초대 발송/ });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Toast 확인
    await expect(
      page.getByText(/초대 메일을 보냈습니다/),
    ).toBeVisible({ timeout: 10_000 });

    // ── 6. DB: status가 'pending'(DB enum, UI상 '발송됨')으로 전이 ─
    const sentRow = await db.execute<{ status: string }>(
      sql`SELECT status::text AS status FROM rfp_invitations
          WHERE rfp_id = ${RFP_ID}
            AND lower(pg_email) = lower(${NEW_PG_EMAIL})`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentArr: any[] = Array.isArray(sentRow)
      ? sentRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((sentRow as any).rows ?? []);
    expect(sentArr[0].status).toBe('pending');

    // Outbox enqueued for the newly added PG
    const outboxRow = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM outbox_entries
          WHERE event_type = 'rfp.invited'
            AND payload->>'to' = ${NEW_PG_EMAIL}
            AND payload->>'rfpId' = ${RFP_ID}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outboxArr: any[] = Array.isArray(outboxRow)
      ? outboxRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((outboxRow as any).rows ?? []);
    expect(outboxArr[0].c).toBe(1);
  });

  test('rejects add when RFP deadline has passed', async ({ page }) => {
    // 마감일을 과거로 강제 → addPgEmailsToRfpAction이 RFP_DEADLINE_PASSED 반환.
    await db.execute(
      sql`UPDATE rfps SET deadline = now() - interval '1 hour'
          WHERE id = ${RFP_ID}`,
    );

    await page.goto('/login');
    await page.fill('input[name="email"]', BUYER_EMAIL);
    await page.fill('input[name="password"]', BUYER_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });

    await page.goto(`/rfp/${RFP_ID}`);
    // canEdit이 false가 되어 "PG 이메일 추가" 입력란 자체가 렌더되지 않음.
    await expect(page.getByPlaceholder('sales@pg.com')).toHaveCount(0);

    // 복원 — 후속 테스트가 마감 전 상태를 가정할 수 있도록.
    await db.execute(
      sql`UPDATE rfps SET deadline = now() + interval '7 days'
          WHERE id = ${RFP_ID}`,
    );
  });
});
