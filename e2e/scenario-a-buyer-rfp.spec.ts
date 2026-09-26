import { test, expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pgRecommendationGroups, pgMatchingPolicies, workspaces, rfps, rfpPgReviews, rfpInvitations, signingContracts } from '@/lib/db/schema';
import { loginAs, rfpUuidFromCode } from './_helpers';

test('상담 요청 → PG 거절 → 다음 PG 견적 → 구매사 최종 선정', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const pgs = await db.select().from(workspaces);
  const first = pgs.find(p => p.name === '서포터 B 페이')!;
  const second = pgs.find(p => p.name === 'KG이니시스')!;
  const groupId = randomUUID();
  const industryName = `온라인 판매 상담 ${groupId.slice(0, 8)}`;
  await db.insert(pgRecommendationGroups).values({ id: groupId, name: industryName });
  await db.insert(pgMatchingPolicies).values({ groupId, policy: { risk: 'gray', candidates: [first, second].map(pg => ({ pgWorkspaceId: pg.id, reason: '온라인 판매 입점 조건 검토', feeMin: 0.8, feeMax: 0.9, feeNote: '카드 결제·부가세 별도, 최종 심사 후 확정' })) } });
  try {
  await loginAs(page, 'buyer');
  await page.goto('/rfp-create');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  const next = () => page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).toBeVisible();
  await page.getByPlaceholder('example.com').fill('example.com');
  await page.screenshot({ path: testInfo.outputPath('question-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('question-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await next(); // 홈페이지 → 구축 방식
  await next(); // 구축 방식(선택) → 업종
  await page.getByRole('searchbox', { name: '업종 검색' }).fill(industryName);
  await page.getByRole('radio', { name: industryName, exact: true }).check();
  await next();
  await page.getByPlaceholder('의류').fill('의류');
  await next();
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await page.getByRole('radio', { name: '아니요', exact: true }).check();
  await next();
  await page.getByRole('radio', { name: '10만원 미만', exact: true }).check();
  await next();
  await page.getByRole('checkbox', { name: '해당 없음', exact: true }).check();
  await next();
  await next(); // 배송 기간(선택) → 계약
  await page.getByRole('button', { name: '신규 계약', exact: true }).click();
  await next();
  await page.getByRole('button', { name: '카드', exact: true }).click();
  await next();
  await page.getByPlaceholder('2026 서포트쇼핑몰 결제 인프라 견적 요청').fill('e2e 맞춤 상담');
  await next();
  await next(); // 추가 내용(선택) → 첨부
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await expect(page.getByText('03 — PG 선택·최종 확인')).toBeInViewport();
  await expect(page.getByRole('radio', { name: /서포터 B 페이/ })).toBeVisible({ timeout: 12_000 });
  await page.screenshot({ path: testInfo.outputPath('matching-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('matching-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('radio', { name: /서포터 B 페이/ }).check();
  await page.locator('input[type="date"]').fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: '상담 요청하기', exact: true }).click();
  await page.waitForURL(/\/rfp\/P-\d{4}-\d{4}$/);
  const code = new URL(page.url()).pathname.split('/').pop()!;
  const id = await rfpUuidFromCode(code);
  await expect(page.getByRole('heading', { name: '서포터 B 페이에 상담을 요청했어요' })).toBeVisible();
  await expect(page.getByText('대화할 상대를 선택해주세요')).toHaveCount(0);
  expect(await db.select().from(rfpInvitations).where(eq(rfpInvitations.rfpId, id))).toHaveLength(1);
  expect(await db.select().from(signingContracts).where(eq(signingContracts.rfpId, id))).toHaveLength(0);

  const pgContext = await browser.newContext();
  const pgPage = await pgContext.newPage();
  await loginAs(pgPage, 'pg-toss');
  await pgPage.goto(`/inbox/${code}`);
  await expect(pgPage.getByText('환금성 상품', { exact: true })).toBeVisible();
  await expect(pgPage.getByText('10만원 미만', { exact: true })).toBeVisible();
  await expect(pgPage.getByText('판매 방식', { exact: true })).toBeVisible();
  await pgPage.getByRole('button', { name: '검토 시작하기' }).click();
  const writeTab = pgPage.getByRole('tab', { name: '견적 작성' });
  await expect(writeTab).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => (await db.select().from(rfpPgReviews).where(eq(rfpPgReviews.rfpId, id)))[0]?.status).toBe('reviewing');
  await pgPage.getByRole('tab', { name: '요청 조건' }).click();
  await pgPage.getByLabel('거절 사유').fill('추가 서류 확인이 어려워요');
  await pgPage.getByRole('button', { name: '상담 거절하기' }).click();
  await expect(pgPage.getByText('상담을 거절할까요?')).toBeVisible();
  await pgPage.getByRole('button', { name: '거절 확정하기' }).click();
  await expect(pgPage.getByText('상담 거절', { exact: true })).toBeVisible();
  await pgContext.close();

  await page.reload();
  await expect(page.getByText('추가 서류 확인이 어려워요')).toBeVisible();
  await expect(page.getByRole('radio', { name: /서포터 B 페이/ })).toHaveCount(0);
  await page.getByRole('radio', { name: /KG이니시스/ }).check();
  await page.getByRole('button', { name: '다음 PG사에 상담 요청하기' }).click();
  await expect(page.getByRole('heading', { name: 'KG이니시스에 상담을 요청했어요' })).toBeVisible();
  await expect(page.getByText('대화할 상대를 선택해주세요')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('matching-followup.png'), fullPage: true });

  const quoteContext = await browser.newContext();
  const quotePage = await quoteContext.newPage();
  await loginAs(quotePage, 'pg-inicis');
  await quotePage.goto(`/inbox/${code}`);
  await quotePage.getByRole('button', { name: '검토 시작하기' }).click();
  await quotePage.getByRole('tab', { name: '견적 작성' }).click();
  await quotePage.locator('select:has(option[value="D"])').selectOption('D');
  await quotePage.getByPlaceholder('1', { exact: true }).fill('3');
  await quotePage.getByPlaceholder('50,000,000').fill('50000000');
  await quotePage.getByRole('button', { name: '수수료', exact: true }).click();
  for (const input of await quotePage.getByPlaceholder('0.00').all()) await input.fill('0.90');
  await quotePage.getByRole('button', { name: '견적서', exact: true }).click();
  await quotePage.getByRole('button', { name: '검토·발송', exact: true }).click();
  await quotePage.getByRole('button', { name: '견적 보내기', exact: true }).first().click();
  await quotePage.getByRole('dialog', { name: '견적을 보낼까요?' }).getByRole('button', { name: '견적 보내기' }).click();
  await expect(quotePage.getByText(/견적을 보냈어요/)).toBeVisible();
  await quoteContext.close();

  await page.reload();
  await expect(page.getByRole('heading', { name: '도착한 견적을 확인해주세요' })).toBeVisible();
  expect(await db.select().from(signingContracts).where(eq(signingContracts.rfpId, id))).toHaveLength(0);
  await page.getByRole('button', { name: /이 견적 선정하기/ }).click();
  await page.getByRole('button', { name: /선정할게요/ }).click();
  await expect.poll(async () => (await db.select().from(rfps).where(eq(rfps.id, id)))[0].status).toBe('awarded');
  await expect.poll(async () => (await db.select().from(signingContracts).where(eq(signingContracts.rfpId, id)))[0]?.status).toBe('awaiting_pg_template');
  expect((await db.select().from(rfpPgReviews).where(eq(rfpPgReviews.rfpId, id))).map(r => r.status).sort()).toEqual(['quoted', 'rejected']);
  } finally {
    await db.delete(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, groupId));
  }
});
