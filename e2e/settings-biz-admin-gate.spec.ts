/**
 * 워크스페이스 등록정보 admin 게이트 e2e.
 *
 * 서버 게이트(updateWorkspaceBizProfileAction)와 컴포넌트 게이트
 * (WorkspaceBizNoForm canEdit)는 각각 유닛으로 덮여 있지만, **둘을 잇는 배선**
 * — `app/(app)/settings/profile/page.tsx` 가 `memberMeta?.role === 'admin'` 을
 * 도출해 prop 으로 내려주는 한 줄 — 은 어느 유닛도 통과하지 않는다.
 * prop 을 거꾸로 넘기거나 상수 true 로 두면 유닛은 전부 green 인 채로 일반
 * 멤버에게 수정 버튼이 다시 보인다.
 *
 * `memberMeta` 는 JWT 가 아니라 DB(ws.members)에서 오므로, 역할만 바꾸고
 * 새로고침하면 재로그인 없이 반영된다.
 */
import { test, expect, type Page } from 'playwright/test';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailFor, loginAs } from './_helpers';

/**
 * 워크스페이스 섹션만 집는다.
 *
 * `hasText: '워크스페이스'` + `.last()` 로는 안 된다 — 위험 영역 섹션의
 * `DeleteAccountSection` 문구가 "…모든 워크스페이스 멤버십이 삭제되며…" 라서 함께
 * 걸리고, `.last()` 가 하필 그쪽을 집는다(실제로 그렇게 통과시켰다가 잡혔다).
 * `.first()` 도 위험하다 — 사용자 섹션에도 '사진 변경' 버튼이 있어서, 섹션을 잘못
 * 집으면 단언이 **거짓 통과**한다. 정확 일치 라벨은 이 섹션에만 있다.
 */
function workspaceSection(page: Page) {
  return page.locator('section').filter({
    has: page.getByText('워크스페이스', { exact: true }),
  });
}

const BUYER_EMAIL = emailFor('buyer');
/** scripts/seed.ts 의 구매사 사업자번호 — 행을 특정하는 앵커. */
const SEEDED_BIZ_NO = '123-45-67890';

/** 시드 구매사의 자기 워크스페이스(=buyer 타입) 멤버십 역할을 바꾼다. */
async function setBuyerRole(role: 'admin' | 'member'): Promise<void> {
  await db.execute(sql`
    UPDATE workspace_members wm
       SET role = ${role}
      FROM users u, workspaces w
     WHERE wm.user_id = u.id
       AND wm.workspace_id = w.id
       AND u.email = ${BUYER_EMAIL}
       AND w.type = 'buyer'
  `);
}

async function getBuyerRole(): Promise<'admin' | 'member'> {
  const rows = (await db.execute(sql`
    SELECT wm.role
      FROM workspace_members wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
     WHERE u.email = ${BUYER_EMAIL}
       AND w.type = 'buyer'
     LIMIT 1
  `)) as unknown as Array<{ role: 'admin' | 'member' }>;
  if (!rows[0]) throw new Error('[e2e] 시드 구매사 멤버십을 찾지 못했어요');
  return rows[0].role;
}

test.describe('설정 — 워크스페이스 등록정보 admin 게이트', () => {
  // 하드코딩된 'admin' 으로 되돌리면 복원이 아니라 승격이다 — 시드가 바뀌면
  // 이 스펙이 조용히 다른 스펙의 전제를 고쳐 놓는다. 실제 값을 읽어 두고 되돌린다.
  let originalRole: 'admin' | 'member';

  test.beforeEach(async () => {
    originalRole = await getBuyerRole();
    // 시드가 바뀌어 구매사가 이미 member 라면 이 스펙의 admin 기준선이 성립하지
    // 않는다. 조용히 통과시키지 말고 큰 소리로 깨뜨린다.
    expect(originalRole).toBe('admin');
  });

  test.afterEach(async () => {
    await setBuyerRole(originalRole);
  });

  test('일반 멤버에게는 수정 버튼이 없고, admin 에게는 있다', async ({ page }) => {
    await loginAs(page, 'buyer');

    // ── admin 기준선 ──────────────────────────────────────────────
    await page.goto('/settings/profile');
    await expect(page.getByText('워크스페이스', { exact: true })).toBeVisible();

    // **사업자번호 행에 스코프해야 한다.** 페이지 전체 '수정' 개수를 세면
    // WorkspaceNameForm 이 같은 canEdit 로 그리는 버튼이 수를 채워 줘서,
    // 이 폼의 게이트가 false 로 굳어도 초록으로 통과한다(이 스펙이 잡으려는
    // 배선이 바로 그것이다).
    const bizRow = page.locator('div').filter({ hasText: SEEDED_BIZ_NO }).last();
    await expect(bizRow.getByRole('button', { name: '수정' })).toBeVisible();
    // 로고 행의 어포던스도 admin 에게는 있어야 한다(섹션 스코프 — 위 member 단언과 대칭).
    const wsSectionAdmin = workspaceSection(page);
    await expect(wsSectionAdmin.getByRole('button', { name: '사진 변경' })).toBeVisible();

    // 사업자번호 행 자체는 역할과 무관하게 값이 보여야 한다(읽기는 허용).
    await expect(page.getByText(SEEDED_BIZ_NO)).toBeVisible();

    // ── 일반 멤버로 강등 ───────────────────────────────────────────
    await setBuyerRole('member');
    await page.reload();
    await expect(page.getByText('워크스페이스', { exact: true })).toBeVisible();

    // 값은 그대로 읽히지만 수정 경로는 사라진다.
    await expect(page.getByText(SEEDED_BIZ_NO)).toBeVisible();
    const bizRowAsMember = page.locator('div').filter({ hasText: SEEDED_BIZ_NO }).last();
    await expect(bizRowAsMember.getByRole('button', { name: '수정' })).toHaveCount(0);
    // 이름 폼도 같은 게이트를 지나므로 페이지 전체로도 0 이어야 한다.
    await expect(page.getByRole('button', { name: '수정' })).toHaveCount(0);

    // 로고 행도 같은 게이트를 지난다. **워크스페이스 섹션에 스코프해야 한다** —
    // UserAvatarForm 이 사용자 본인 아바타에 같은 이름('사진 변경')의 버튼을 그리고
    // 그쪽은 (올바르게) 게이트를 지나지 않으므로, 페이지 전역으로 세면 0 이 될 수 없다.
    const wsSection = workspaceSection(page);
    await expect(wsSection.getByRole('button', { name: '사진 변경' })).toHaveCount(0);
    // 패널이 왜 아무것도 못 바꾸는지 한 줄로 알려 준다.
    await expect(wsSection.getByText(/관리자가 바꿀 수 있어요/)).toBeVisible();
  });
});
