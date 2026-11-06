import { test, expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { workspaces, pgRecommendationGroups, pgMatchingPolicies } from '@/lib/db/schema';
import { createGuestDraft, GUEST_DRAFT_KEY } from '@/lib/guest-rfp/draft';

for (const contractType of ['new', 'renewal'] as const) test(contractType + ': server rates, keyboard, mobile, reduced motion and restored inputs', async ({ page, context }, testInfo) => {
  test.setTimeout(150000);
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': contractType === 'new' ? '198.18.2.1' : '198.18.2.2' });
  const group = randomUUID(), pgs = [randomUUID(), randomUUID()];
  await db.insert(workspaces).values(pgs.map((id, index) => ({ id, name: '계산검증 PG ' + index, type: 'pg' as const, status: 'active' as const })));
  await db.insert(pgRecommendationGroups).values({ id: group, name: '계산검증 의류 ' + group });
  await db.insert(pgMatchingPolicies).values({ groupId: group, policy: { risk: 'white', candidates: pgs.map((pgWorkspaceId, index) => ({ pgWorkspaceId, reason: '의류 상담', feeNote: '부가세 별도, 심사 후 확정', feesByTier: { sole: 1 + index, sme1: null, sme2: null, sme3: null, general: null } })) } });
  try {
    const draft = createGuestDraft();
    Object.assign(draft.data, { contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '계산 확인', mainProducts: '의류', deliveryServicePeriod: 'D+3', industryGroupId: group, contractType,
      monthlyAvgPgVolume: '999999999', currentFeeRate: '2.2', currentPgs: [{ pgWorkspaceId: null, name: '기존 외부 PG' }], requiredPaymentMethods: ['card'],
      productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] } });
    await page.addInitScript(({ key, draft }) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft)); }, { key: GUEST_DRAFT_KEY, draft });
    await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/quote-start');
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.getByRole('button', { name: '작성 마치기' }).click();
    const revenue = page.getByLabel(contractType === 'new' ? '예상 연매출 구간' : '연매출 구간', { exact: true });
    await expect(revenue).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('slider')).toHaveCount(0);
    await expect(page.getByLabel(/연간 카드 거래액/)).toHaveCount(0);
    let calculatorCalls = 0;
    page.on('request', request => { if (request.url().includes('/api/guest-rfp/savings')) calculatorCalls++; });
    await revenue.selectOption('300000000');
    await expect(page.getByText('1%', { exact: true })).toBeVisible();
    const pg = page.getByRole('radio', { name: /계산검증 PG 0/ });
    await pg.focus(); await page.keyboard.press('Space');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const next = page.getByRole('button', { name: '다음', exact: true });
      if (width < 1024) {
        await expect(next).toBeEnabled(); await next.click();
        await expect(page.getByRole('heading', { name: '응답 기간' })).toBeVisible();
        await page.getByRole('button', { name: '이전', exact: true }).click();
        await expect(pg).toBeChecked();
      } else {
        const left = await page.getByRole('region', { name: '맞춤 PG 추천', exact: true }).boundingBox();
        const right = await page.getByRole('heading', { name: '응답 기간' }).boundingBox();
        expect(right!.x).toBeGreaterThan(left!.x + left!.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`guest-${contractType}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByText('요청 내용 전체 보기').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: process.env.GUEST_RFP_AUTO_SEND_ENABLED === 'true' ? '선택한 PG사에 자동 요청하기' : '가입하고 이어갈게요' }).click({ trial: true });
    await page.reload();
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await expect(revenue).toHaveValue('300000000', { timeout: 20000 });
    await expect(pg).not.toBeChecked();
    expect(calculatorCalls).toBe(0);

  } finally {
    await db.delete(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, group));
    await db.delete(workspaces).where(inArray(workspaces.id, pgs));
  }
});
