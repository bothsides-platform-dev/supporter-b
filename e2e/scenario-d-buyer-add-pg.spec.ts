/**
 * Scenario D — buyer adds PG (workspace) to an already-sent RFP.
 *
 * 흐름:
 *   1. Buyer logs in, opens seed RFP `P-2604-0001` 상세.
 *   2. RfpInviteManager UI에서 신규 워크스페이스 칩을 클릭해
 *      선택 → `[ 대기중 ]`(draft) 상태로 누적.
 *   3. "초대 보내기" 클릭 → `[ 초대 보냄 ]`(pending)으로 전환 + outbox enqueue.
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
        // 스키마 기본값은 'pending' 인데 PG 피커(searchWorkspaces)는 active 만
        // 반환한다 — 빠지면 아래 칩 클릭이 타임아웃한다.
        status: 'active',
      });
    }

    // select-or-insert 재사용 경로까지 덮는다: 이 스펙이 status 를 명시하기 전에
    // 만들어진 행은 'pending' 으로 남아 있고, 그러면 insert 분기를 타지 않아
    // 위의 status 지정이 영영 적용되지 않는다.
    await db
      .update(workspaces)
      .set({ status: 'active' })
      .where(sql`${workspaces.id} = ${newPgWsId}`);

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
        // 이 유저는 현재 로그인하지 않지만(scenario-d는 buyer로만 로그인),
        // 향후 이 계정으로 로그인하는 스펙이 생겨도 이메일 인증 게이트에 막히지
        // 않도록 방어적으로 인증 완료 상태로 시드한다.
        emailVerified: true,
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
    // allowlist 도 함께 지운다 — addPgWorkspaces 는 이미 allowlist 에 있는 워크스페이스를
    // **토스트도 초대행도 없이** 조용히 건너뛴다(rfp.ts:596-602 → ok:true, addedCount 0).
    // CI 는 매 실행마다 리시드라 무해하지만, 로컬 재실행에서는 이것이 정확히 "0행" 증상을
    // 만든다. 지운 뒤 전제를 단언해 그 갈래를 아예 배제한다.
    await db.execute(
      sql`DELETE FROM rfp_allowed_pg
          WHERE rfp_id = ${rfpUuid} AND pg_ws_id = ${newPgWsId}`,
    );
    const preAllow = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM rfp_allowed_pg
          WHERE rfp_id = ${rfpUuid} AND pg_ws_id = ${newPgWsId}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preAllowArr: any[] = Array.isArray(preAllow)
      ? preAllow
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((preAllow as any).rows ?? []);
    expect(preAllowArr[0].c).toBe(0);
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
    // 딜룸 'PG 관리' 탭으로 전환해 RfpInviteManager 를 띄운다(구 아코디언 대체).
    await page.getByRole('tab', { name: 'PG 관리' }).click({ timeout: 15_000 });
    await expect(page.getByText('초대 PG')).toBeVisible();

    // ── 3. Add a new PG workspace by clicking its chip ───────────
    // 마운트 시 lazy fetch(/api/workspaces/search?type=pg)가 칩을 채운다.
    // 새로 시드된 워크스페이스는 칩 버튼으로 렌더되므로 바로 클릭한다.
    await page
      .getByRole('button', { name: NEW_PG_NAME, exact: true })
      .click({ timeout: 15_000 });

    // ── 4. 서버가 draft 초대를 실제로 만들 때까지 기다린다 ───────────
    // ⚠️ 옛 대기 두 줄은 공허했다 — getByText(NEW_PG_NAME) 은 피커 칩 **자신**을,
    // text=/대기중/ 은 정적 안내 문단(RfpInviteManager:187-190)을 잡아 클릭 직후
    // 즉시 통과했다. 그래서 아래 SELECT 가 서버 액션 커밋 **전에** 돌아 0행을 봤다.
    // 서버 데이터에서 파생되는 유일한 신호는 초대 보내기 버튼의 draft 카운트다
    // (RfpInviteManager:68,196-209) — router.refresh() 로 새 데이터가 온 뒤에만 1 이 된다.
    const sendBtn = page.getByRole('button', { name: '1개 PG에 초대 보내기' });
    const addFailToast = page.getByText(/추가하지 못했어요/);
    // 액션이 조용히 ok:false 로 끝나면 30초 무의미 타임아웃 대신 에러 코드와 함께 죽는다.
    await expect(sendBtn.or(addFailToast)).toBeVisible({ timeout: 15_000 });
    await expect(addFailToast).toHaveCount(0);
    await expect(sendBtn).toBeVisible();
    // 목록 행에 '대기중' Chip 이 실제로 붙었다 — exact 로 안내 문단을 배제한다.
    await expect(page.getByText('대기중', { exact: true })).toBeVisible();

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
    // (버튼 핸들은 위 4단계에서 이미 잡았다 — 라벨의 draft 카운트가 곧 동기화 지점이다.)
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
      // canEdit=false → 'PG 관리' 탭은 '초대 PG' 목록만 보이고
      // 'PG 워크스페이스 추가' 영역(칩 포함)은 통째로 숨김.
      await page.getByRole('tab', { name: 'PG 관리' }).click({ timeout: 15_000 });
      await expect(page.getByText('초대 PG')).toBeVisible();
      await expect(page.getByText('PG 워크스페이스 추가')).toHaveCount(0);
    } finally {
      // 복원 — 후속 테스트가 마감 전 상태를 가정할 수 있도록 try/finally.
      await db.execute(
        sql`UPDATE rfps SET deadline = now() + interval '7 days'
            WHERE id = ${rfpUuid}`,
      );
    }
  });
});
