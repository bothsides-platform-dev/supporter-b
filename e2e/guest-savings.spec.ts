import { test, expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { workspaces, pgRecommendationGroups, pgMatchingPolicies, pgAgreementRates } from '@/lib/db/schema';
import { createGuestDraft, GUEST_DRAFT_KEY } from '@/lib/guest-rfp/draft';

for (const contractType of ['new', 'renewal'] as const) test(contractType + ': server rates, keyboard, mobile, reduced motion and restored inputs', async ({ page, context }) => {
  test.setTimeout(150000);
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': contractType === 'new' ? '198.18.2.1' : '198.18.2.2' });
  const group = randomUUID(), pgs = [randomUUID(), randomUUID()];
  await db.insert(workspaces).values(pgs.map((id, index) => ({ id, name: '계산검증 PG ' + index, type: 'pg' as const, status: 'active' as const })));
  await db.insert(pgRecommendationGroups).values({ id: group, name: '계산검증 의류 ' + group });
  await db.insert(pgMatchingPolicies).values({ groupId: group, policy: { risk: 'white', candidates: pgs.map((pgWorkspaceId, index) => ({ pgWorkspaceId, reason: '의류 상담', feeNote: '부가세 별도, 심사 후 확정', feesByTier: { sole: 1 + index, sme1: null, sme2: null, sme3: null, general: null } })) } });
  await db.insert(pgAgreementRates).values(pgs.map(pgWsId => ({ pgWsId, rates: [{ key: 'card:sole', rate: .03 }] })));
  try {
    const draft = createGuestDraft();
    Object.assign(draft.data, { contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '계산 확인', mainProducts: '의류', deliveryServicePeriod: 'D+3', industryGroupId: group, contractType,
      annualPgVolume: '999999999', currentFeeRate: '2.2', currentPgs: [{ pgWorkspaceId: null, name: '기존 외부 PG' }], requiredPaymentMethods: ['card'],
      productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] } });
    await page.addInitScript(({ key, draft }) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft)); }, { key: GUEST_DRAFT_KEY, draft });
    await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/quote-start');
    await page.getByRole('button', { name: '작성 마치기' }).click();
    const revenue = page.getByLabel(contractType === 'new' ? '예상 연매출 구간' : '연매출 구간', { exact: true });
    const volume = page.getByLabel(contractType === 'new' ? '예상 연간 카드 거래액' : '연간 카드 거래액', { exact: true });
    await expect(volume).toHaveValue('');
    await expect(page.getByRole('slider')).toHaveCount(0);
    await revenue.selectOption('300000000');
    await volume.fill('120000000');
    if (contractType === 'renewal') await page.getByLabel('현재 수수료 부가세 기준').selectOption('included');
    await page.getByRole('button', { name: '예상 절감액 확인하기' }).focus();
    await page.keyboard.press('Enter');
    const amount = contractType === 'new' ? '2,400,000원' : '1,200,000원';
    await expect(page.getByRole('status').filter({ hasText: '연간' })).toContainText(amount, { timeout: 30000 });
    await expect(page.getByText('계산검증 PG 0', { exact: true }).last()).toBeVisible();
    for (const [width, zoom] of [[320, 1], [390, 1], [1280, 1], [640, 2]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, zoom);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: '이 정보로 맞춤 견적 받기' }).click({ trial: true });
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await page.getByLabel('비교 PG', { exact: true }).selectOption(pgs[1]);
    await expect(page.getByRole('status').filter({ hasText: contractType === 'new' ? '1,200,000원' : '절감 효과가 확인되지 않았어요' })).toBeVisible();
    await page.reload();
    await expect(volume).toHaveValue('120,000,000');
    await expect(revenue).toHaveValue('300000000');
    await expect(page.getByRole('button', { name: '이 정보로 맞춤 견적 받기' })).toBeEnabled();
  } finally {
    await db.delete(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, group));
    await db.delete(pgAgreementRates).where(inArray(pgAgreementRates.pgWsId, pgs));
    await db.delete(workspaces).where(inArray(workspaces.id, pgs));
  }
});
