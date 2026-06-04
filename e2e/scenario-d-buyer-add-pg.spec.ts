/**
 * Scenario D — buyer adds PG (workspace) to an already-sent RFP.
 *
 * 흐름:
 *   1. Buyer logs in, opens seed RFP `P-2604-0001` 상세.
 *   2. RfpInviteManager UI에서 "PG사 검색…" → cmdk 목록에서 신규 워크스페이스
 *      선택 → `[ 대기중 ]`(draft) 상태로 누적.
 *   3. "초대 발송" 클릭 → `[ 발송됨 ]`(pending)으로 전환 + outbox enqueue.
 *
 * Coverage:
 *   - addPgWorkspacesToRfpAction (workspaceIds 배열 → draft invitation insert).
 *   - sendDraftInvitationsAction (draft → pending DB enum, fresh tokenHash, outbox).
 *   - UI mounting via RfpInviteManager (status chip, send button enable).
 *
 * Pre-condition: scenario-c 가 RFP 상태를 'awarded'로 만들 수 있으므로 (alphabetical
 * 순서로 c → d 실행), beforeAll 에서 resetRfpForKanban 으로 'sent'로 되돌린다.
 */
import { test, expect } from 'playwright/test';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';
import { users, workspaces } from '@/lib/db/schema';
import { resetRfpForKanban, rfpUuidFromCode } from './_helpers';
import { hashPassword } from '@/lib/auth/password';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const BUYER_EMAIL = 'yeonseong.dev@gmail.com';
const BUYER_PASSWORD = 'password123';
const RFP_ID = 'P-2604-0001';
const NEW_PG_NAME = 'NICE페이먼츠';

test.describe.serial('Scenario D — buyer adds PG to existing RFP', () => {
  let newPgWsId: string;
  // RFP_ID is the human code; FK columns + dedupe keys use the uuid.
  let rfpUuid: string;

  test.beforeAll(async () => {
    // Ensure RFP is in editable state (scenario-c may have left it awarded).
    await resetRfpForKanban(RFP_ID);
    rfpUuid = await rfpUuidFromCode(RFP_ID);

    // Seed a 4th PG workspace exclusive to this scenario. The 3 seeded PGs
    // (서포터 B 페이/이니시스/카카오) are already invited to P-2604-0001 — we need a
    // workspace that's NOT yet invited so the action takes the insert path.
    // Idempotent: select-or-insert by name. We also attach a single admin
    // user so `sendDraftInvitationsAction` has somebody to enqueue email
    // for (the dedupe key encodes adminUserId) — otherwise the outbox
    // assertion below would be vacuous.
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(sql`${workspaces.name} = ${NEW_PG_NAME}`)
      .limit(1);
    if (existing[0]) {
      newPgWsId = existing[0].id;
    } else {
      newPgWsId = randomUUID();
      await db.insert(workspaces).values({
        id: newPgWsId,
        type: 'pg',
        name: NEW_PG_NAME,
      });
    }

    // Ensure NICE페이먼츠 has at least one admin so the rfp.invited outbox
    // enqueue path fires (dedupe key needs admin userId). Idempotent.
    const adminEmail = 'ws-nice-admin@nicepay.co.kr';
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${adminEmail})`)
      .limit(1);
    let adminUserId: string;
    if (existingUser) {
      adminUserId = existingUser.id;
    } else {
      adminUserId = randomUUID();
      await db.insert(users).values({
        id: adminUserId,
        email: adminEmail,
        passwordHash: await hashPassword('password123'),
        name: 'NICE 관리자',
      });
    }
    await db.execute(
      sql`INSERT INTO workspace_members (workspace_id, user_id, role)
          VALUES (${newPgWsId}, ${adminUserId}, 'admin')
          ON CONFLICT DO NOTHING`,
    );

    // Clean up any previous-run invitation for this workspace on this RFP
    // so the addPgWorkspacesToRfpAction insert path actually runs.
    await db.execute(
      sql`DELETE FROM rfp_invitations
          WHERE rfp_id = ${rfpUuid} AND pg_ws_id = ${newPgWsId}`,
    );
  });

  test('buyer adds PG workspace, drafts accumulate, send-drafts dispatches mail', async ({
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

    // ── 3. Add a new PG workspace via Popover + cmdk ─────────────
    // Trigger lazy fetch (/api/workspaces/search?type=pg) and click the
    // newly seeded workspace by name.
    await page.getByRole('button', { name: 'PG사 검색…' }).click();
    await page.getByRole('option', { name: NEW_PG_NAME }).click();

    // ── 4. UI: new row renders with status chip '대기중' (draft) ───
    await expect(page.getByText(NEW_PG_NAME)).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('text=/대기중/').first(),
    ).toBeVisible({ timeout: 10_000 });

    // DB assertion: invitation row inserted with status='draft'
    const draftRow = await db.execute<{ status: string }>(
      sql`SELECT status::text AS status FROM rfp_invitations
          WHERE rfp_id = ${rfpUuid} AND pg_ws_id = ${newPgWsId}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draftArr: any[] = Array.isArray(draftRow)
      ? draftRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((draftRow as any).rows ?? []);
    expect(draftArr).toHaveLength(1);
    expect(draftArr[0].status).toBe('draft');

    // Allowlist membership lives in the rfp_allowed_pg join table (replaced the
    // old rfps.allowed_pg_workspace_ids array column).
    const allowRow = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM rfp_allowed_pg
          WHERE rfp_id = ${rfpUuid} AND pg_ws_id = ${newPgWsId}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allowArr: any[] = Array.isArray(allowRow)
      ? allowRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((allowRow as any).rows ?? []);
    expect(allowArr[0].c).toBe(1);

    // ── 5. Click "초대 보내기" → outbox + status flip ────────────────
    const sendBtn = page.getByRole('button', { name: /개 PG에 초대 보내기/ });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Toast 확인
    await expect(
      page.getByText(/초대 메일을 보냈어요/),
    ).toBeVisible({ timeout: 10_000 });

    // ── 6. DB: status가 'pending'(DB enum, UI상 '초대 보냄')으로 전이 ─
    const sentRow = await db.execute<{ status: string }>(
      sql`SELECT status::text AS status FROM rfp_invitations
          WHERE rfp_id = ${rfpUuid} AND pg_ws_id = ${newPgWsId}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentArr: any[] = Array.isArray(sentRow)
      ? sentRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((sentRow as any).rows ?? []);
    expect(sentArr[0].status).toBe('pending');

    // Outbox enqueued for the newly added PG. dedupeKey shape is
    // `rfp:{rfpId}:invite:ws:{pgWsId}:user:{adminUserId}`. We attached
    // exactly one admin in beforeAll, so we expect exactly one row.
    const outboxRow = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM outbox_entries
          WHERE event = 'rfp.invited'
            AND dedupe_key LIKE ${'rfp:' + rfpUuid + ':invite:ws:' + newPgWsId + ':%'}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outboxArr: any[] = Array.isArray(outboxRow)
      ? outboxRow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((outboxRow as any).rows ?? []);
    expect(outboxArr[0].c).toBe(1);
  });

  test('rejects add when RFP deadline has passed', async ({ page }) => {
    // 마감일을 과거로 강제 → canEdit=false → RfpInviteManager 가 추가 섹션을
    // 통째로 숨김.
    await db.execute(
      sql`UPDATE rfps SET deadline = now() - interval '1 hour'
          WHERE id = ${rfpUuid}`,
    );

    try {
      await page.goto('/login');
      await page.fill('input[name="email"]', BUYER_EMAIL);
      await page.fill('input[name="password"]', BUYER_PASSWORD);
      await page.getByRole('button', { name: '로그인' }).click();
      await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });

      await page.goto(`/rfp/${RFP_ID}`);
      // canEdit=false → "PG사 검색…" trigger 자체가 렌더되지 않음.
      await expect(
        page.getByRole('button', { name: 'PG사 검색…' }),
      ).toHaveCount(0);
    } finally {
      // 복원 — 후속 테스트가 마감 전 상태를 가정할 수 있도록 try/finally.
      await db.execute(
        sql`UPDATE rfps SET deadline = now() + interval '7 days'
            WHERE id = ${rfpUuid}`,
      );
    }
  });
});
