/**
 * RFP/인박스 상세 네비게이션 — 진입점별 동작 (견적 딜룸 모달 개편 후).
 *
 *   1. 목록(/rfp · /inbox) 행 클릭(soft-nav) → 인터셉트 라우트(@modal/(.)[id])가
 *      목록 위에 **딜룸 모달**을 띄운다(`[data-testid="deal-room-modal"]`). URL 은
 *      /rfp/<code> 로 바뀐다. 상단바 ⤢ 는 모달을 CSS inset-0 로 확장(전환, 모달 유지).
 *   2. 대시보드 링크(/home, 세그먼트 밖) · 직접 진입(하드 네비) → 정식 **전체
 *      페이지**(인터셉트 없음 → 모달 없음).
 *
 * 모달 식별자: `[data-testid="deal-room-modal"]`(Popup) — 전체 페이지엔 없다.
 * /rfp-create(작성)는 /rfp 네임스페이스 밖이라 [id] 인터셉터에 가로채지지 않는다.
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
const MODAL = '[data-testid="deal-room-modal"]';

test.describe('RFP 상세 네비게이션 (구매사)', () => {
  test('대시보드 RFP 링크 클릭 → 전체 페이지(모달 아님)', async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, 'buyer');
    const rfpLink = page.locator(`a[href="/rfp/${RFP_CODE}"]`).first();
    await expect(rfpLink).toBeVisible({ timeout: 120_000 });

    await rfpLink.click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('견적 비교')).toBeVisible();
    await expect(page.locator(MODAL)).toHaveCount(0);
  });

  test('목록 행 클릭 → 딜룸 모달(인터셉트), 전체화면 토글 → 모달 확장', async ({ page }) => {
    // 모달 대기 60s 를 test.slow()(=90s) 안에 우겨넣으면 goto·클릭 몫이 남지 않는다.
    test.setTimeout(120_000);
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    // 행 클릭(soft-nav) → /rfp/<code> + 목록 위 딜룸 모달. ?peek 아님.
    await page.getByText(RFP_CODE).click();
    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page).not.toHaveURL(/\?peek=/);
    const modal = page.locator(MODAL);
    // 인터셉트 라우트(@modal/(.)[id]) 는 이 push 시점에 처음 컴파일된다 — dev 서버
    // cold-compile 이 expect 기본 5초를 넘긴다(CI 실측). URL 은 이미 바뀐 뒤라
    // 모달만 늦게 뜨는 구간이고, 같은 파일의 다른 단언들과 같은 여유를 준다.
    await expect(modal).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('tab', { name: '견적 비교' })).toBeVisible();

    // 전체화면 토글(CSS inset-0) → 모달 유지 + data-fullscreen, URL 불변.
    await expect(modal).not.toHaveAttribute('data-fullscreen', 'true');
    await page.getByRole('button', { name: '전체화면' }).click();
    await expect(modal).toHaveAttribute('data-fullscreen', 'true');
    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`));
  });

  test('직접 진입(하드 네비)은 전체 페이지로 렌더(모달 아님)', async ({ page }) => {
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_CODE}`);

    await expect(page.getByText('견적 비교')).toBeVisible();
    await expect(page.locator(MODAL)).toHaveCount(0);
  });
});

test.describe('RFP 작성 진입은 상세 라우트로 오인되지 않는다 (구매사)', () => {
  test('목록에서 "견적 요청하기" soft-nav → 작성 폼(모달/에러 아님)', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    await page.getByRole('link', { name: '견적 요청하기' }).first().click();

    await expect(
      page.getByRole('heading', { name: '새 견적 요청' }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('견적 요청을 찾을 수 없어요.')).toHaveCount(0);
    await expect(page.locator(MODAL)).toHaveCount(0);
  });
});

test.describe('RFP 상세 네비게이션 (PG)', () => {
  test('대시보드 RFP 링크 클릭 → 전체 페이지, ← 뒤로 → /home 복귀', async ({ page }) => {
    test.slow();

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

    await loginAs(page, 'pg-toss');

    const inboxLink = page.locator(`a[href="/inbox/${RFP_CODE}"]`).first();
    await expect(inboxLink).toBeVisible({ timeout: 60_000 });

    await inboxLink.click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.locator(MODAL)).toHaveCount(0);

    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('인박스 목록 행 클릭 → 딜룸 모달(인터셉트), 전체화면 토글 → 모달 확장', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'pg-toss');
    await page.goto('/inbox');

    await page.getByText(RFP_CODE).click();
    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page).not.toHaveURL(/\?peek=/);
    const modal = page.locator(MODAL);
    // 위와 같은 이유 — /inbox 쪽 인터셉트 라우트의 첫 컴파일이 여기서 일어난다.
    await expect(modal).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: '전체화면' }).click();
    await expect(modal).toHaveAttribute('data-fullscreen', 'true');
    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`));
  });
});
