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
    // 아래 재시도 블록(최대 100s) 이 test.slow()(=90s) 안에 안 들어간다.
    test.setTimeout(150_000);
    await loginAs(page, 'buyer');
    const modal = page.locator(MODAL);

    // 행 클릭(soft-nav) → /rfp/<code> + 목록 위 딜룸 모달. ?peek 아님.
    // ⚠️ 전체를 재시도로 감싼 이유(2026-08-26, CI trace 로 확정): dev 서버가 이
    // 인터셉트 라우트를 **처음** 만들 때 경합이 있다 — RSC 요청
    // `GET /rfp/<code>?_rsc=…` 이 500 을 내고(서버 로그: `Invalid interception
    // route: /rfp/(.)(.)(.)(.)<code>`) Next 가 하드 네비로 폴백해 **정식 페이지**를
    // 그린다. 그러면 URL 은 맞는데 모달이 영영 없어서 대기 시간을 늘려도 소용없다.
    // 두 번째 시도부터는 라우트가 컴파일돼 있어 정상 인터셉트된다. 단언 자체는
    // 그대로라 "모달이 아예 안 뜨는" 진짜 회귀는 여전히 이 블록이 잡는다.
    // 근본 해법은 CI e2e 를 프로덕션 빌드로 돌리는 것 — TODOS 참조.
    await expect(async () => {
      await page.goto('/rfp');
      await page.getByText(RFP_CODE).click();
      await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
      await expect(page).not.toHaveURL(/\?peek=/);
      await expect(modal).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 100_000, intervals: [1_000, 2_000, 5_000] });
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
    test.setTimeout(150_000);
    await loginAs(page, 'pg-toss');
    const modal = page.locator(MODAL);

    // 위 구매사 케이스와 같은 이유로 재시도한다 — /inbox 인터셉트 라우트의 첫
    // 생성에서 같은 500(`Invalid interception route: /inbox/(.)(.)(.)(.)<code>`)이
    // 나고 하드 네비로 폴백한다(CI trace 실측).
    await expect(async () => {
      await page.goto('/inbox');
      await page.getByText(RFP_CODE).click();
      await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
      await expect(page).not.toHaveURL(/\?peek=/);
      await expect(modal).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 100_000, intervals: [1_000, 2_000, 5_000] });

    await page.getByRole('button', { name: '전체화면' }).click();
    await expect(modal).toHaveAttribute('data-fullscreen', 'true');
    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`));
  });
});
