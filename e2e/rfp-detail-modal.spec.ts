/**
 * RFP 상세 가로채기 모달 (Jira 방식) — 구매사.
 *
 * Next.js intercepting + parallel routes 동작을 end-to-end 로 검증한다(단위 테스트
 * 불가 영역):
 *   1. /rfp 목록에서 행 클릭 → URL 이 /rfp/<code> 로 바뀌고 모달이 목록 위에 뜬다.
 *   2. 뒤로가기 → 모달 닫힘, URL 복귀, 목록 유지.
 *   3. /rfp/<code> 직접 진입(하드 네비) → 전체 페이지(모달 아님).
 */
import { test, expect } from 'playwright/test';

import { loginAs } from './_helpers';

const RFP_CODE = 'P-2604-0001';

test.describe('RFP 상세 가로채기 모달 (구매사)', () => {
  test('목록 행 클릭 → 모달, 뒤로가기 → 닫힘', async ({ page }) => {
    // dev 서버는 가로채기 라우트를 첫 진입 시 컴파일한다(무거운 자식 트리 포함).
    // cold 컴파일이 기본 30s 예산을 넘을 수 있어 타임아웃을 늘린다(prod는 사전컴파일).
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    // 행 클릭(soft-nav) → 가로채기.
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('제안 비교')).toBeVisible();

    // 뒤로가기 → 모달 닫힘, 목록 URL 복귀.
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/rfp$/);
  });

  test('직접 진입(하드 네비)은 전체 페이지로 렌더(모달 아님)', async ({ page }) => {
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_CODE}`);

    await expect(page.getByText('제안 비교')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('RFP 상세 가로채기 모달 (PG)', () => {
  test('인박스 행 클릭 → 모달, 뒤로가기 → 닫힘', async ({ page }) => {
    // dev cold 컴파일 흡수(BidForm 등 무거운 트리 포함) — prod는 사전컴파일.
    test.slow();
    await loginAs(page, 'pg-toss');
    await page.goto('/inbox');

    // 행 클릭(soft-nav). 인박스 행은 code 로 이동해야 가로채진다(uuid 면 404).
    await page.getByText(RFP_CODE).click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/inbox$/);
  });
});
