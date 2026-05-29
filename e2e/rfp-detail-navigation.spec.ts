/**
 * RFP/인박스 상세 네비게이션 — 진입점별 동작.
 *
 * 상세는 가로채기 라우트 모달(@modal)로 렌더되지 않는다. 진입점에 따라:
 *   1. 홈 대시보드 ActionQueue 링크 클릭 → /rfp/<code> 전체 페이지.
 *   2. /rfp 목록 행 클릭 → ?peek=<code> 사이드 패널(미리보기, SplitView).
 *      패널의 '전체화면' 버튼 → /rfp/<code> 전체 페이지.
 *   3. /rfp/<code> 직접 진입(하드 네비) → 전체 페이지.
 * PG 인박스(/inbox/<code>, ?peek=<code>)도 동일.
 *
 * 회귀 가드(전 케이스 공통): 상세가 가로채기 라우트 dialog 로 렌더되지 않음
 * (`getByRole('dialog').toHaveCount(0)`; peek 은 dialog 아닌 사이드 패널).
 *
 * 주의: /home 은 이전 KanbanBoard 에서 KPI strip + ActionQueue 의 대시보드로
 * 재설계됨. 칸반은 /rfp(구매사) / /inbox(PG) 에서만 렌더된다.
 */
import { test, expect } from 'playwright/test';
import { eq, and } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { rfpInvitations, workspaces } from '@/lib/db/schema';
import { loginAs, rfpUuidFromCode } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const RFP_CODE = 'P-2604-0001';

test.describe('RFP 상세 네비게이션 (구매사)', () => {
  test('홈 대시보드 RFP 링크 클릭 → 전체 페이지', async ({ page }) => {
    // dev 서버는 라우트를 첫 진입 시 컴파일한다(login+home 트리). 이 스펙의
    // 첫 테스트라 cold-compile 비용을 전부 떠안으므로 예산을 넉넉히(prod는 사전컴파일).
    test.setTimeout(180_000);
    await loginAs(page, 'buyer'); // /home 착지(대시보드)
    // ActionQueue 가 RFP 링크를 그릴 때까지 대기(cold-compile 흡수) — 이후 클릭이
    // 컴파일 예산을 잠식하지 않도록. dashboard 의 a[href="/rfp/<code>"] 가 ready 신호.
    const rfpLink = page.locator(`a[href="/rfp/${RFP_CODE}"]`).first();
    await expect(rfpLink).toBeVisible({ timeout: 120_000 });

    // 대시보드 링크 클릭 → 전체 페이지(모달 아님).
    await rfpLink.click();

    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('제안 비교')).toBeVisible();
    // '상세 라우트가 모달로 가로채기 렌더 안 됨' 의 회귀 가드. 단, Channel.io
     // 챗 위젯의 'Channel Talk pop-up' 다이얼로그가 dev 환경의 env(.env.local 의
     // NEXT_PUBLIC_CHANNEL_IO_PLUGIN_KEY)에서 함께 잡힐 수 있어 이를 명시적으로 제외.
    await expect(
      page.getByRole('dialog').filter({ hasNotText: /Channel Talk/i }),
    ).toHaveCount(0);
  });

  test('목록 행 클릭은 peek 사이드 패널을 열고, 전체화면 버튼은 전체 페이지로 렌더', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    // 행 클릭(soft-nav) → ?peek=<code> 사이드 패널(미리보기). 패널은
    // RfpDetailContent('제안 비교')를 렌더한다.
    await page.getByText(RFP_CODE).click();
    await expect(page).toHaveURL(new RegExp(`/rfp\\?peek=${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('제안 비교')).toBeVisible();
    // 회귀 가드: peek 은 SplitView 사이드 패널 — 가로채기 라우트 dialog 가 아니다.
    // (Channel.io 'Channel Talk pop-up' 다이얼로그는 dev env 에서 함께 잡힐 수 있어 제외.)
    await expect(
      page.getByRole('dialog').filter({ hasNotText: /Channel Talk/i }),
    ).toHaveCount(0);

    // 패널 헤더 '전체화면' 버튼 → /rfp/<code> 전체 페이지(하드 라우트).
    await page.getByRole('button', { name: '전체화면', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/rfp/${RFP_CODE}$`), { timeout: 60_000 });
    await expect(page.getByText('제안 비교')).toBeVisible();
  });

  test('직접 진입(하드 네비)은 전체 페이지로 렌더', async ({ page }) => {
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_CODE}`);

    await expect(page.getByText('제안 비교')).toBeVisible();
    // '상세 라우트가 모달로 가로채기 렌더 안 됨' 의 회귀 가드. 단, Channel.io
     // 챗 위젯의 'Channel Talk pop-up' 다이얼로그가 dev 환경의 env(.env.local 의
     // NEXT_PUBLIC_CHANNEL_IO_PLUGIN_KEY)에서 함께 잡힐 수 있어 이를 명시적으로 제외.
    await expect(
      page.getByRole('dialog').filter({ hasNotText: /Channel Talk/i }),
    ).toHaveCount(0);
  });
});

test.describe('RFP 작성 진입은 상세 라우트로 오인되지 않는다 (구매사)', () => {
  // 회귀 가드: /rfp/new(작성, 최상위 정적 세그먼트)는 /rfp/[id](상세, 동적)보다
  // 우선하므로, "RFP를 찾을 수 없습니다." 가 아니라 작성 폼이 떠야 한다.
  test('목록에서 "새 RFP" soft-nav → 작성 폼(에러 아님)', async ({ page }) => {
    test.slow();
    await loginAs(page, 'buyer');
    await page.goto('/rfp');

    // /rfp 페이지 헤더의 작성 진입 링크. 사이드바에도 같은 라벨의 링크가 있어
    // strict-mode 충돌을 피하려 first() 로 좁힌다(둘 중 어느 쪽을 눌러도 의도는 동일).
    await page.getByRole('link', { name: '새 RFP' }).first().click();

    await expect(
      page.getByRole('heading', { name: '신규 제안 요청' }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('RFP를 찾을 수 없습니다.')).toHaveCount(0);
  });
});

test.describe('RFP 상세 네비게이션 (PG)', () => {
  test('홈 대시보드 RFP 링크 클릭 → 전체 페이지, ← 뒤로 → /home 복귀', async ({ page }) => {
    // dev cold 컴파일 흡수(BidForm 등 무거운 트리 포함) — prod는 사전컴파일.
    test.slow();

    // PG 대시보드 ActionQueue 는 invitation.status ∈ ('pending','opened') 인
    // 항목만 렌더한다(이미 응답한 RFP 는 액션 큐에서 제외 — 의도된 디자인).
    // 시드된 toss 초대는 P-2604-0001 에서 'accepted' 라 액션 큐에 안 잡힌다.
    // 이 테스트는 '홈에서 상세로의 진입 동선' 을 검증하므로, 토스 초대를
    // 'pending' 으로 되돌려 대시보드 링크가 그려지게 한다.
    const rfpUuid = await rfpUuidFromCode(RFP_CODE);
    const [toss] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, '서포터 B 페이'))
      .limit(1);
    await db
      .update(rfpInvitations)
      .set({ status: 'pending', acceptedByUserId: null })
      .where(
        and(
          eq(rfpInvitations.rfpId, rfpUuid),
          eq(rfpInvitations.pgWsId, toss.id),
        ),
      );

    await loginAs(page, 'pg-toss'); // /home 착지(PG 대시보드)

    // PG 대시보드의 ActionQueue 링크는 a[href="/inbox/<code>"] 로 그려진다.
    const inboxLink = page.locator(`a[href="/inbox/${RFP_CODE}"]`).first();
    await expect(inboxLink).toBeVisible({ timeout: 60_000 });

    await inboxLink.click();

    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
    // '상세 라우트가 모달로 가로채기 렌더 안 됨' 의 회귀 가드. 단, Channel.io
     // 챗 위젯의 'Channel Talk pop-up' 다이얼로그가 dev 환경의 env(.env.local 의
     // NEXT_PUBLIC_CHANNEL_IO_PLUGIN_KEY)에서 함께 잡힐 수 있어 이를 명시적으로 제외.
    await expect(
      page.getByRole('dialog').filter({ hasNotText: /Channel Talk/i }),
    ).toHaveCount(0);

    // 인박스 상세 페이지 본문에도 '← 뒤로' 텍스트 버튼이 있어 헤더의
    // aria-label='뒤로' 와 부분 일치한다. 헤더 백버튼만 정확히 타겟팅.
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('인박스 목록 행 클릭은 peek 사이드 패널을 열고, 전체화면 버튼은 전체 페이지로 렌더', async ({ page }) => {
    test.slow();
    await loginAs(page, 'pg-toss');
    await page.goto('/inbox');

    // 행 클릭(soft-nav) → ?peek=<code> 사이드 패널(미리보기).
    await page.getByText(RFP_CODE).click();
    await expect(page).toHaveURL(new RegExp(`/inbox\\?peek=${RFP_CODE}$`), { timeout: 60_000 });
    // 회귀 가드: peek 은 SplitView 사이드 패널 — 가로채기 라우트 dialog 가 아니다.
    // (Channel.io 'Channel Talk pop-up' 다이얼로그는 dev env 에서 함께 잡힐 수 있어 제외.)
    await expect(
      page.getByRole('dialog').filter({ hasNotText: /Channel Talk/i }),
    ).toHaveCount(0);

    // 패널 헤더 '전체화면' 버튼 → /inbox/<code> 전체 페이지(하드 라우트).
    await page.getByRole('button', { name: '전체화면', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/inbox/${RFP_CODE}$`), { timeout: 60_000 });
  });
});
