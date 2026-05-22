/**
 * RFP/인박스 상세 네비게이션 — 진입점과 무관하게 항상 전체 페이지.
 *
 * 상세 모달(가로채기 슬롯)은 제거됨. 칸반(home)·목록·직접 진입 모두 전체 페이지로
 * 렌더되고, 칸반에서 들어온 경우 "← 뒤로"(router.back)로 /home 으로 복귀한다.
 *   1. 홈 칸반 카드 클릭 → /rfp/<code> 전체 페이지(모달 아님), ← 뒤로 → /home.
 *   2. /rfp 목록 행 클릭 → 전체 페이지.
 *   3. /rfp/<code> 직접 진입(하드 네비) → 전체 페이지.
 * PG 인박스(/inbox/<code>)도 동일.
 */
import { test, expect } from 'playwright/test';

import { loginAs } from './_helpers';

const RFP_CODE = 'P-2604-0001';

test.describe('RFP 상세 네비게이션 (구매사)', () => {
  test('홈 칸반 카드 클릭 → 전체 페이지, ← 뒤로 → /home 복귀', async ({ page }) => {
    // dev 서버는 라우트를 첫 진입 시 컴파일한다(login+home+칸반 트리). 이 스펙의
    // 첫 테스트라 cold-compile 비용을 전부 떠안으므로 예산을 넉넉히(prod는 사전컴파일).
    test.setTimeout(180_000);
    await loginAs(page, 'buyer'); // /home 착지(칸반)
    // 칸반 렌더 대기(cold-compile 흡수) — 이후 클릭이 컴파일 예산을 잠식하지 않도록.
    await expect(page.getByRole('region', { name: '제안 칸반' })).toBeVisible({
      timeout: 120_000,
    });

    // 칸반 카드 클릭 → 전체 페이지(모달 아님).
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('제안 비교')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // ← 뒤로(router.back) → /home 복귀.
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('목록 행 클릭(soft-nav)은 전체 페이지로 렌더', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('제안 비교')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('직접 진입(하드 네비)은 전체 페이지로 렌더', async ({ page }) => {
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_CODE}`);

    await expect(page.getByText('제안 비교')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('RFP 작성 진입은 상세 라우트로 오인되지 않는다 (구매사)', () => {
  // 회귀 가드: /rfp/new(작성, 최상위 정적 세그먼트)는 /rfp/[id](상세, 동적)보다
  // 우선하므로, "RFP를 찾을 수 없습니다." 가 아니라 작성 폼이 떠야 한다.
  test('목록에서 "신규 제안" soft-nav → 작성 폼(에러 아님)', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    await page.getByRole('link', { name: '신규 제안' }).first().click();

    await expect(
      page.getByRole('heading', { name: '신규 제안 요청' }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('RFP를 찾을 수 없습니다.')).toHaveCount(0);
  });
});

test.describe('RFP 상세 네비게이션 (PG)', () => {
  test('홈 칸반 카드 클릭 → 전체 페이지, ← 뒤로 → /home 복귀', async ({ page }) => {
    // dev cold 컴파일 흡수(BidForm 등 무거운 트리 포함) — prod는 사전컴파일.
    test.slow();
    await loginAs(page, 'pg-toss'); // /home 착지(칸반)

    // PG 칸반 카드 클릭 → /inbox/<code> 전체 페이지.
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('인박스 목록 행 클릭(soft-nav)은 전체 페이지로 렌더', async ({ page }) => {
    test.slow();
    await loginAs(page, 'pg-toss');
    await page.goto('/inbox');

    // 행 클릭(soft-nav). 인박스 행은 code 로 이동(uuid 면 404).
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
