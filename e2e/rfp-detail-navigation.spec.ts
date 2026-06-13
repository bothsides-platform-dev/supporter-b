/**
 * RFP/인박스 상세 네비게이션 — 진입점별 동작 (견적 딜룸 모달 개편 후).
 *
 * 상세는 진입 방식에 따라 두 모습으로 렌더된다:
 *   1. 목록(/rfp · /inbox) 행 클릭(soft-nav) → 인터셉트 라우트(@modal/(.)[id])가
 *      목록 위에 **딜룸 모달**을 띄운다. URL 은 /rfp/<code> 로 바뀌고, 모달 상단바에
 *      '전체화면' 링크가 있다.
 *   2. 대시보드 링크 클릭(/home → /rfp/<code>, 세그먼트 밖) · 직접 진입(하드 네비) ·
 *      '전체화면' 링크(풀 리로드) → 정식 **전체 페이지**(인터셉트 없음, 모달 없음).
 *
 * 모달 식별자(브리틀 회피): 상단바 '전체화면' 링크(role=link, name='전체화면')는
 * 모달에만 존재한다 — 전체 페이지에는 없다. /rfp-create(작성, 정적 세그먼트)는
 * /rfp/[id](동적)보다 우선하므로 모달로 가로채지지 않아야 한다.
 */
import { test, expect } from 'playwright/test';
import { eq, and } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { bids, workspaces } from '@/lib/db/schema';
import { loginAs, rfpUuidFromCode } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const RFP_CODE = 'P-2604-0001';

test.describe('RFP 상세 네비게이션 (구매사)', () => {
  test('대시보드 RFP 링크 클릭 → 전체 페이지(모달 아님)', async ({ page }) => {
    // dev 서버는 라우트를 첫 진입 시 컴파일한다(login+home 트리). 이 스펙의 첫
    // 테스트라 cold-compile 비용을 전부 떠안으므로 예산을 넉넉히(prod는 사전컴파일).
    test.setTimeout(180_000);
    await loginAs(page, 'buyer'); // /home 착지(대시보드)
    const rfpLink = page.locator(`a[href="/rfp/${RFP_CODE}"]`).first();
    await expect(rfpLink).toBeVisible({ timeout: 120_000 });

    await rfpLink.click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('견적 비교')).toBeVisible();
    // 세그먼트 밖(/home) 진입은 인터셉트되지 않으므로 모달 '전체화면' 링크가 없다.
    await expect(page.getByRole('link', { name: '전체화면' })).toHaveCount(0);
  });

  test('목록 행 클릭 → 딜룸 모달(인터셉트), 전체화면 링크 → 전체 페이지', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    // 행 클릭(soft-nav) → /rfp/<code> 로 URL 변경 + 목록 위 딜룸 모달. ?peek 아님.
    await page.getByText(RFP_CODE).click();
    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page).not.toHaveURL(/\?peek=/);
    // 모달 식별자: 상단바 '전체화면' 링크 + 본문 '견적 비교'.
    const fullscreen = page.getByRole('link', { name: '전체화면' });
    await expect(fullscreen).toBeVisible();
    await expect(page.getByText('견적 비교')).toBeVisible();

    // '전체화면'(풀 리로드) → 정식 전체 페이지. 모달 마커(전체화면 링크)가 사라진다.
    await fullscreen.click();
    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByRole('link', { name: '전체화면' })).toHaveCount(0);
    await expect(page.getByText('견적 비교')).toBeVisible();
  });

  test('직접 진입(하드 네비)은 전체 페이지로 렌더(모달 아님)', async ({ page }) => {
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_CODE}`);

    await expect(page.getByText('견적 비교')).toBeVisible();
    await expect(page.getByRole('link', { name: '전체화면' })).toHaveCount(0);
  });
});

test.describe('RFP 작성 진입은 상세 라우트로 오인되지 않는다 (구매사)', () => {
  // 회귀 가드: /rfp-create(작성, 최상위 정적 세그먼트)는 /rfp/[id](상세, 동적)보다
  // 우선하므로 인터셉트 모달이 아니라 작성 폼이 떠야 한다.
  test('목록에서 "견적 요청하기" soft-nav → 작성 폼(모달/에러 아님)', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    await page.getByRole('link', { name: '견적 요청하기' }).first().click();

    await expect(
      page.getByRole('heading', { name: '새 견적 요청' }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('견적 요청을 찾을 수 없어요.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '전체화면' })).toHaveCount(0);
  });
});

test.describe('RFP 상세 네비게이션 (PG)', () => {
  test('대시보드 RFP 링크 클릭 → 전체 페이지, ← 뒤로 → /home 복귀', async ({ page }) => {
    test.slow();

    // PG 대시보드 ActionQueue 는 classifyPgInvitation 이 'received' 인 항목만
    // 렌더한다(bid.status 기준). 시드 toss bid 는 'submitted' 라 'draft' 로 리셋해
    // 'received' stage 로 분류되게 한다.
    const rfpUuid = await rfpUuidFromCode(RFP_CODE);
    const [toss] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, '서포터 B 페이'))
      .limit(1);
    await db
      .update(bids)
      .set({ status: 'draft' })
      .where(and(eq(bids.rfpId, rfpUuid), eq(bids.pgWsId, toss.id)));

    await loginAs(page, 'pg-toss'); // /home 착지(PG 대시보드)

    const inboxLink = page.locator(`a[href="/inbox/${RFP_CODE}"]`).first();
    await expect(inboxLink).toBeVisible({ timeout: 60_000 });

    await inboxLink.click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    // 세그먼트 밖 진입 → 인터셉트 없음 → 모달 '전체화면' 링크 없음.
    await expect(page.getByRole('link', { name: '전체화면' })).toHaveCount(0);

    // 인박스 상세 페이지 본문에도 '← 뒤로' 텍스트가 있어 헤더 백버튼만 정확히 타겟팅.
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('인박스 목록 행 클릭 → 딜룸 모달(인터셉트), 전체화면 링크 → 전체 페이지', async ({ page }) => {
    test.slow();
    await loginAs(page, 'pg-toss');
    await page.goto('/inbox');

    // 행 클릭(soft-nav) → /inbox/<code> + 목록 위 딜룸 모달. ?peek 아님.
    await page.getByText(RFP_CODE).click();
    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page).not.toHaveURL(/\?peek=/);
    const fullscreen = page.getByRole('link', { name: '전체화면' });
    await expect(fullscreen).toBeVisible();

    // '전체화면'(풀 리로드) → 정식 전체 페이지.
    await fullscreen.click();
    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByRole('link', { name: '전체화면' })).toHaveCount(0);
  });
});
