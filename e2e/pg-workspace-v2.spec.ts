import { test, expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { eq, and, inArray, count } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { rfps, workspaces, rfpInvitations, rfpAllowedPg, bidDrafts, bids } from '@/lib/db/schema';
import { loginAs } from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@127.0.0.1:5433/supporter_b_test';

test.describe.serial('PG 업무 화면 v2', () => {
  test.setTimeout(180_000);
  const ids: string[] = [];
  let buyerId: string;
  let pgId: string;
  const code = 'P-2611-7000';

  test.beforeAll(async () => {
    const [source] = await db.select().from(rfps).where(eq(rfps.code, 'P-2604-0001'));
    const [buyer] = await db.select().from(workspaces).where(eq(workspaces.id, source.buyerWsId));
    const [pg] = await db.select().from(workspaces).where(eq(workspaces.name, '서포터 B 페이'));
    pgId = pg.id;
    buyerId = randomUUID();
    await db.insert(workspaces).values({
      ...buyer,
      id: buyerId,
      name: '아주 긴 회사명을 사용하는 전국 온라인 유통 및 교육 서비스 주식회사',
      canonicalPgKey: null,
    });
    const deadline = new Date(Date.now() + 7 * 86400_000);
    const requests = Array.from({ length: 205 }, (_, i) => {
      const id = randomUUID();
      ids.push(id);
      return {
        ...source,
        id,
        buyerWsId: buyerId,
        code: `P-2611-${7000 + i}`,
        title: `업무 검증 ${String(i).padStart(3, '0')} · 온라인 판매와 정기 결제 조건을 함께 검토하는 긴 요청 제목`,
        shareToken: randomUUID(),
        status: 'sent' as const,
        awardedBidId: null,
        boardColumnId: null,
        deadline,
        sentAt: new Date(),
        contractType: i % 2 ? ('renewal' as const) : ('new' as const),
        requiredPaymentMethods: ['card', 'bank_transfer', 'virtual_account', 'naver_pay'],
        currentTerms: {
          _v: 1,
          annualPgVolume: i % 3 ? '1200000000' : undefined,
        },
        hiddenFromPg: [],
      };
    });
    await db.insert(rfps).values(requests);
    await db.insert(rfpAllowedPg).values(ids.map((rfpId) => ({ rfpId, pgWsId: pgId })));
    await db.insert(rfpInvitations).values(
      ids.map((rfpId) => ({
        rfpId,
        pgWsId: pgId,
        tokenHash: randomUUID(),
        expiresAt: deadline,
        status: 'pending' as const,
      })),
    );
  });

  test.afterAll(async () => {
    if (ids.length) await db.delete(rfps).where(inArray(rfps.id, ids));
    if (buyerId) await db.delete(workspaces).where(eq(workspaces.id, buyerId));
  });

  test('205건의 목록·URL·선택한 상세·키보드·반응형을 유지한다', async ({ page }) => {
    await loginAs(page, 'pg-toss');
    for (const width of [1280, 1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/inbox?q=업무+검증&sort=deadline');
      const table = page.getByRole('table', { name: '받은 견적 요청' });
      await expect(table).toBeVisible();
      await expect(table.locator('tbody tr')).toHaveCount(50);
      await expect(page.getByText('1 / 5', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^전체205$/ })).toBeVisible();
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
      await page.screenshot({
        path: `test-results/pg-inbox-${width}.png`,
        fullPage: true,
      });
      if (width === 1280) {
        const [opened] = await db
          .select({ value: count() })
          .from(rfpInvitations)
          .where(and(inArray(rfpInvitations.rfpId, ids), eq(rfpInvitations.status, 'opened')));
        expect(opened.value).toBe(0);
      }
      const first = table.locator('[data-inbox-row]').first();
      await first.focus();
      await page.keyboard.press('Enter');
      const preview = page.getByRole('complementary', {
        name: '견적 요청 미리보기',
      });
      await expect(preview).toBeVisible();
      await expect(page).toHaveURL(/selected=P-2611-7000/);
      await expect(preview.getByText('구매사가 첨부한 자료가 없어요.')).toBeVisible();
      if (width >= 1024) {
        expect((await preview.boundingBox())!.width).toBe(width === 1440 ? 560 : 480);
        await expect(table.getByRole('columnheader')).toHaveCount(3);
      } else await expect(table).not.toBeVisible();
      await page.screenshot({
        path: `test-results/pg-preview-${width}.png`,
        fullPage: true,
      });
      await preview.getByRole('button', { name: '다음 요청' }).click();
      await expect(page).toHaveURL(/selected=P-2611-7001/);
      await page.goBack();
      await expect(page).toHaveURL(/selected=P-2611-7000/);
      await page.reload();
      await expect(preview).toBeVisible();
      await preview.press('Escape');
      await expect(preview).not.toBeVisible();
      await expect(first).toBeFocused();
      await page.getByRole('button', { name: '다음 페이지' }).click();
      await expect(page).toHaveURL(/page=2/);
      await expect(page.getByText('2 / 5', { exact: true })).toBeVisible();
      await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('recent');
      await expect(page.getByText('1 / 5', { exact: true })).toBeVisible();
      await page
        .getByRole('textbox', { name: '구매사명·제목·요청 번호 검색' })
        .fill('없는 요청 검색');
      await page.getByRole('button', { name: '검색', exact: true }).click();
      await expect(page.getByText('조건에 맞는 견적 요청이 없어요.')).toBeVisible();
    }
    const opened = await db
      .select({ id: rfpInvitations.rfpId })
      .from(rfpInvitations)
      .where(and(inArray(rfpInvitations.rfpId, ids), eq(rfpInvitations.status, 'opened')));
    expect(opened.map((r) => r.id).sort()).toEqual(ids.slice(0, 2).sort());
  });

  test('다른 브라우저의 초안 복원·충돌·오프라인 보관·이탈 보호·마감 후 복구', async ({
    page,
    browser,
    context,
  }) => {
    await loginAs(page, 'pg-toss');
    await page.goto(`/inbox/${code}?tab=write`);
    const limit = page.getByPlaceholder('50,000,000');
    await expect(limit).toBeVisible();
    await limit.fill('11100000');
    await expect(page.getByRole('status').filter({ hasText: '계정에 저장했어요' })).toBeVisible({
      timeout: 20_000,
    });
    const other = await browser.newContext({
      storageState: await context.storageState(),
      baseURL: 'http://localhost:3001',
    });
    try {
      const second = await other.newPage();
      await second.goto(`/inbox/${code}?tab=write`);
      await expect(second.getByPlaceholder('50,000,000')).toHaveValue('11,100,000');
      await second.getByPlaceholder('50,000,000').fill('22200000');
      await expect(second.getByRole('status').filter({ hasText: '계정에 저장했어요' })).toBeVisible(
        { timeout: 20_000 },
      );
      await limit.fill('33300000');
      await expect(page.getByRole('button', { name: '현재 내용으로 저장' })).toBeVisible();
      await expect(limit).toHaveValue('33,300,000');
      await page.getByText('계정에 저장한 내용 확인', { exact: true }).click();
      await expect(page.getByText('22,200,000원', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '현재 내용으로 저장' }).click();
      await expect(page.getByRole('status').filter({ hasText: '계정에 저장했어요' })).toBeVisible({
        timeout: 20_000,
      });
      await context.setOffline(true);
      await limit.fill('44400000');
      await page.getByRole('button', { name: '임시 저장', exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: '이 브라우저에만 보관했어요' }),
      ).toBeVisible();
      const unload = page.waitForEvent('dialog');
      await page.evaluate(() => history.back());
      const browserGuard = await unload;
      expect(browserGuard.type()).toBe('beforeunload');
      await browserGuard.dismiss();
      await expect(limit).toHaveValue('44,400,000');
      await page.getByRole('link', { name: '받은 견적 요청', exact: true }).click();
      const leave = page.getByRole('dialog', {
        name: '저장 상태를 확인하고 이동할까요?',
      });
      await expect(leave).toBeVisible();
      await expect(leave.getByRole('button', { name: '계속 작성하기' })).toBeFocused();
      await leave.getByRole('button', { name: '계속 작성하기' }).click();
      await expect(limit).toHaveValue('44,400,000');
      await context.setOffline(false);
      await page.getByRole('button', { name: '임시 저장', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: '계정에 저장했어요' })).toBeVisible({
        timeout: 20_000,
      });
      await page.reload();
      await expect(limit).toHaveValue('44,400,000');
      await db
        .update(rfps)
        .set({ deadline: new Date(Date.now() - 1000) })
        .where(eq(rfps.id, ids[0]));
      await page.reload();
      await page.getByText('내 초안 복구 · 최초 견적 · 읽기 전용').click();
      await expect(page.getByText('44,400,000원', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: '견적 보내기', exact: true }),
      ).not.toBeVisible();
      const [draft] = await db.select().from(bidDrafts).where(eq(bidDrafts.rfpId, ids[0]));
      expect(draft.submittedBidId).toBeNull();
    } finally {
      await context.setOffline(false);
      await other.close();
    }
  });

  test('제출 응답이 유실되면 입력을 잠그고 저장된 제출 결과를 확인한다', async ({ page }) => {
    await loginAs(page, 'pg-toss');
    const target = 'P-2611-7002';
    await page.goto(`/inbox/${target}?tab=write`);
    await page.getByPlaceholder('50,000,000').fill('50000000');
    await page.getByRole('combobox', { name: '가입비 (원·최초 1회) 조건' }).selectOption('confirmed');
    await page.getByRole('textbox', { name: '가입비 입력 금액' }).fill('0');
    await page.getByRole('combobox', { name: '보증보험 금액(원) 조건' }).selectOption('negotiable');
    await page.getByRole('button', { name: '수수료', exact: true }).click();
    await page.getByPlaceholder('0.00').first().fill('0.50');
    await page.getByRole('button', { name: '견적서', exact: true }).click();
    await page.getByPlaceholder(/추가 안내 사항이 있으면/).fill('응답 유실 복구 검증');
    await page.getByRole('button', { name: '검토하고 발송', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '계정에 저장했어요' })).toBeVisible({ timeout: 20_000 });
    let dropped = false;
    await page.route(`**/inbox/${target}*`, async route => {
      if (!dropped && route.request().method() === 'POST' && route.request().headers()['next-action']) {
        dropped = true;
        await route.fetch(); // Commit on the server, then lose only the response.
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: '견적 보내기', exact: true }).click();
    await page.getByRole('dialog', { name: '견적을 보낼까요?' }).getByRole('button', { name: '견적 보내기', exact: true }).click();
    await expect(page.getByRole('button', { name: '제출 결과 확인하기' })).toBeVisible({ timeout: 20_000 });
    expect(dropped).toBe(true);
    await expect(page.getByRole('button', { name: '견적 보내기', exact: true }).first()).toBeDisabled();
    await page.getByRole('button', { name: '제출 결과 확인하기' }).click();
    await expect(page.getByText('✓ 견적을 보냈어요')).toBeVisible({ timeout: 20_000 });
    const result = await db.select().from(bids).where(and(eq(bids.rfpId, ids[2]), eq(bids.pgWsId, pgId)));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ signupFee: '0.00', guaranteeInsurance: null, quoteTerms: { _v: 2, signupFee: { state: 'confirmed', value: 0 }, guaranteeInsurance: { state: 'negotiable' } } });
  });

  test('실패한 PDF 원본은 브라우저에 보관하고 새로고침 후 다시 올릴 수 있다', async ({ page }) => {
    await loginAs(page, 'pg-toss');
    await page.goto('/inbox/P-2611-7003?tab=write');
    await page.getByRole('combobox', { name: '가입비 (원·최초 1회) 조건' }).selectOption('not_applicable');
    await page.getByRole('combobox', { name: '보증보험 금액(원) 조건' }).selectOption('negotiable');
    await page.getByRole('button', { name: '수수료', exact: true }).click();
    await page.getByRole('button', { name: '견적서', exact: true }).click();
    let attempts = 0;
    await page.route('**/api/files/presign', async route => {
      attempts += 1;
      expect(route.request().headers()['x-draft-user']).toBeTruthy();
      expect(route.request().headers()['x-draft-workspace']).toBe(pgId);
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"TEST_UPLOAD_UNAVAILABLE"}' });
    });
    await page.locator('input[type=file]').setInputFiles({ name: '복구할-견적.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF') });
    await expect(page.getByText(/업로드하지 못한 복구할-견적.pdf을 이 브라우저에 보관했어요/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '계정에 저장했어요' })).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByRole('button', { name: '다시 업로드', exact: true })).toBeVisible();
    const previous = attempts;
    await page.getByRole('button', { name: '다시 업로드', exact: true }).click();
    await expect.poll(() => attempts).toBeGreaterThan(previous);
    await expect(page.getByText(/업로드하지 못한 복구할-견적.pdf을 이 브라우저에 보관했어요/)).toBeVisible();
  });
});
