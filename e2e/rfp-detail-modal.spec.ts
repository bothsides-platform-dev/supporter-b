/**
 * RFP/인박스 상세 가로채기 모달 — 칸반(home)에서만.
 *
 * 가로채기 슬롯이 app/(app)/home/@modal 로 스코프돼, /home(칸반)에서 출발한
 * soft-nav 만 모달로 가로챈다. /rfp·/inbox 목록 등 다른 세그먼트에서 출발한
 * soft-nav, 그리고 직접 진입/새로고침은 전체 페이지로 렌더된다.
 *   1. 홈 칸반 카드 클릭(soft-nav) → URL /rfp/<code>, 모달이 칸반 위에 뜬다.
 *   2. 뒤로가기 → 모달 닫힘, /home 복귀.
 *   3. /rfp 목록 행 클릭 → 전체 페이지(모달 아님).
 *   4. /rfp/<code> 직접 진입(하드 네비) → 전체 페이지.
 * PG 인박스(/inbox/<code>)도 동일.
 */
import { test, expect } from 'playwright/test';

import { loginAs } from './_helpers';

const RFP_CODE = 'P-2604-0001';

test.describe('RFP 상세 가로채기 모달 (구매사)', () => {
  test('홈 칸반 카드 클릭 → 모달, 뒤로가기 → 닫힘', async ({ page }) => {
    // dev 서버는 라우트를 첫 진입 시 컴파일한다(login+home+칸반 트리). 이 스펙의
    // 첫 테스트라 cold-compile 비용을 전부 떠안으므로 예산을 넉넉히(prod는 사전컴파일).
    test.setTimeout(180_000);
    await loginAs(page, 'buyer'); // /home 착지(칸반)
    // 칸반 렌더 대기(cold-compile 흡수) — 이후 클릭이 컴파일 예산을 잠식하지 않도록.
    await expect(page.getByRole('region', { name: '제안 칸반' })).toBeVisible({
      timeout: 120_000,
    });

    // 칸반 카드 클릭(soft-nav) → home/@modal 가로채기.
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('제안 비교')).toBeVisible();

    // 뒤로가기 → 모달 닫힘, /home 복귀.
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/home$/);
  });

  test('목록 행 클릭(soft-nav)은 전체 페이지로 렌더(모달 아님)', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    // 행 클릭(soft-nav). /rfp 세그먼트에는 가로채기 슬롯이 없으므로 전체 페이지.
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('제안 비교')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('직접 진입(하드 네비)은 전체 페이지로 렌더(모달 아님)', async ({ page }) => {
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_CODE}`);

    await expect(page.getByText('제안 비교')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('RFP 작성 진입은 가로채기되지 않는다 (구매사)', () => {
  // 회귀 가드: 작성 라우트가 /rfp/new 였을 때 (.)rfp/[id] 인터셉터가 soft-nav 를
  // 가로채 "RFP를 찾을 수 없습니다." 모달만 떴다. 작성 라우트를 /rfp-new(형제
  // 경로)로 옮겨 인터셉터가 잡지 않아야 한다.
  test('목록에서 "신규 제안" soft-nav → 작성 폼(모달·에러 아님)', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    await page.getByRole('link', { name: '신규 제안' }).first().click();

    await expect(
      page.getByRole('heading', { name: '신규 제안 요청' }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('RFP를 찾을 수 없습니다.')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('RFP 상세 가로채기 모달 (PG)', () => {
  test('홈 칸반 카드 클릭 → 모달, 뒤로가기 → 닫힘', async ({ page }) => {
    // dev cold 컴파일 흡수(BidForm 등 무거운 트리 포함) — prod는 사전컴파일.
    test.slow();
    await loginAs(page, 'pg-toss'); // /home 착지(칸반)

    // PG 칸반 카드 클릭(soft-nav) → /inbox/<code> 가로채기.
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/home$/);
  });

  test('인박스 목록 행 클릭(soft-nav)은 전체 페이지로 렌더(모달 아님)', async ({ page }) => {
    test.slow();
    await loginAs(page, 'pg-toss');
    await page.goto('/inbox');

    // 행 클릭(soft-nav). 인박스 행은 code 로 이동(uuid 면 404).
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
