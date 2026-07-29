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
import { test, expect } from 'playwright/test';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailFor, loginAs } from './_helpers';

const BUYER_EMAIL = emailFor('buyer');

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

test.describe('설정 — 워크스페이스 등록정보 admin 게이트', () => {
  test.afterEach(async () => {
    // 시드 기본값으로 복원 — 다른 스펙이 admin 을 전제한다.
    await setBuyerRole('admin');
  });

  test('일반 멤버에게는 수정 버튼이 없고, admin 에게는 있다', async ({ page }) => {
    await loginAs(page, 'buyer');

    // ── admin 기준선 ──────────────────────────────────────────────
    await page.goto('/settings/profile');
    await expect(page.getByText('워크스페이스', { exact: true })).toBeVisible();
    const adminEditButtons = await page.getByRole('button', { name: '수정' }).count();
    // 등록정보(사업자번호) + 워크스페이스 이름 — 둘 다 같은 canEdit 로 갈린다.
    expect(adminEditButtons).toBeGreaterThan(0);

    // 사업자번호 행 자체는 역할과 무관하게 값이 보여야 한다(읽기는 허용).
    await expect(page.getByText('123-45-67890')).toBeVisible();

    // ── 일반 멤버로 강등 ───────────────────────────────────────────
    await setBuyerRole('member');
    await page.reload();
    await expect(page.getByText('워크스페이스', { exact: true })).toBeVisible();

    // 값은 그대로 읽히지만 수정 경로는 사라진다.
    await expect(page.getByText('123-45-67890')).toBeVisible();
    await expect(page.getByRole('button', { name: '수정' })).toHaveCount(0);
  });
});
