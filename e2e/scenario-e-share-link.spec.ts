/**
 * Scenario E — RFP-scoped 공유 링크.
 *
 * 흐름 (positive):
 *   1. seed RFP `P-2604-0001`의 share_token을 직접 조회.
 *   2. 매칭 도메인 PG 사용자(`ws-toss-admin@toss.im`)로 로그인.
 *   3. `/share/rfp/<token>` 진입 → claimShareTokenAction이 도메인 매칭 OK.
 *      이미 invitation을 가진 사용자(seed)이므로 idempotent 분기로 통과.
 *   4. `/inbox/<rfpId>`로 redirect.
 *
 * Coverage:
 *   - claimShareTokenAction: 도메인 화이트리스트 검증 + idempotent.
 *   - /share/rfp/[token] route + ShareClaimClient redirect.
 */
import { test, expect } from 'playwright/test';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://bidit:bidit@localhost:5433/bidit_test';

const TOSS_EMAIL = 'ws-toss-admin@toss.im';
const TOSS_PASSWORD = 'password123';
const RFP_ID = 'P-2604-0001';

test.describe.serial('Scenario E — share link claim by allowed domain user', () => {
  test('toss user opens share URL → lands on inbox', async ({ page }) => {
    // ── Pre: fetch share_token for the seeded RFP ────────────────
    const tokenRow = await db.execute<{ share_token: string }>(
      sql`SELECT share_token FROM rfps WHERE id = ${RFP_ID}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenArr: any[] = Array.isArray(tokenRow)
      ? tokenRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((tokenRow as any).rows ?? []);
    expect(tokenArr).toHaveLength(1);
    const shareToken = tokenArr[0].share_token as string;
    expect(shareToken).toBeTruthy();

    // ── 1. Login as toss admin ───────────────────────────────────
    await page.goto('/login');
    await page.fill('input[name="email"]', TOSS_EMAIL);
    await page.fill('input[name="password"]', TOSS_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });

    // ── 2. Visit /share/rfp/<token> ──────────────────────────────
    await page.goto(`/share/rfp/${shareToken}`);

    // ── 3. Redirected to /inbox/<rfpId> ──────────────────────────
    await page.waitForURL(new RegExp(`/inbox/${RFP_ID}$`), {
      timeout: 15_000,
    });
  });

  test('buyer session is rejected with SHARE_BUYER_NOT_ALLOWED', async ({
    page,
  }) => {
    const tokenRow = await db.execute<{ share_token: string }>(
      sql`SELECT share_token FROM rfps WHERE id = ${RFP_ID}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenArr: any[] = Array.isArray(tokenRow)
      ? tokenRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((tokenRow as any).rows ?? []);
    const shareToken = tokenArr[0].share_token as string;

    // buyer 세션이 공유 링크를 클릭하면 도메인 검증 전에 buyer 가드에서 차단.
    // 우연히 buyer 이메일이 PG 도메인을 갖더라도(예: buyer@toss.im) PG 워크스페이스에
    // 자동 합류시켜선 안 되므로 보수적으로 차단.
    await page.goto('/login');
    await page.fill('input[name="email"]', 'yeonseong.dev@gmail.com');
    await page.fill('input[name="password"]', 'password123');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });

    await page.goto(`/share/rfp/${shareToken}`);
    await expect(
      page.getByText(/구매사 계정으로는 공유 링크를 사용할 수 없습니다/),
    ).toBeVisible({ timeout: 10_000 });
  });
});
