import { test, expect } from 'playwright/test';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';
import { pgMatchingPolicies, pgRecommendationGroups, rfpMatchingRequests, rfpPgReviews, rfps, workspaces } from '@/lib/db/schema';
import { loginAs } from './_helpers';

test('구매사가 마감일을 연장하고 접수 종료 뒤 다시 연다', async ({ page }) => {
  const row = (await db.select().from(rfps).where(eq(rfps.code, 'P-2604-0001')))[0];
  const original = row.deadline;
  try {
    await loginAs(page, 'buyer');
    await page.goto('/rfp/P-2604-0001');
    await page.getByRole('button', { name: '마감일 연장' }).click();
    await expect(page.getByRole('group', { name: '영업일 기간' })).toBeVisible();
    await page.getByRole('button', { name: '10영업일' }).click();
    await expect(page.getByText(/오후 6시 마감/)).toBeVisible();
    await page.getByRole('button', { name: '마감일 연장하기' }).click();
    await expect.poll(async () => (await db.select().from(rfps).where(eq(rfps.id, row.id)))[0].deadline.toISOString()).not.toBe(original.toISOString());

    await db.update(rfps).set({ deadline: new Date('2020-01-01T09:00:00Z') }).where(eq(rfps.id, row.id));
    await page.reload();
    await page.getByRole('button', { name: '견적 접수 다시 열기' }).click();
    await expect(page.getByRole('group', { name: '영업일 기간' })).toBeVisible();
    await page.getByRole('button', { name: '견적 접수 다시 열기' }).last().click();
    await expect.poll(async () => (await db.select().from(rfps).where(eq(rfps.id, row.id)))[0].deadline.getTime()).toBeGreaterThan(Date.now());
  } finally {
    await db.update(rfps).set({ deadline: original }).where(eq(rfps.id, row.id));
  }
});

test('답변 없이 마감된 상담은 현재 PG를 종료하고 다음 PG로 전환한다', async ({ page }) => {
  const row = (await db.select().from(rfps).where(eq(rfps.code, 'P-2605-0002')))[0];
  const original = row.deadline;
  const pgs = await db.select().from(workspaces);
  const first = pgs.find(pg => pg.name === '서포터 B 페이')!;
  const second = pgs.find(pg => pg.name === 'KG이니시스')!;
  const groupId = randomUUID();
  const reviewId = randomUUID();
  const candidate = (pgWorkspaceId: string) => ({ pgWorkspaceId, reason: '결제 상담', feeMin: null, feeMax: null, feeNote: '' });
  await db.insert(pgRecommendationGroups).values({ id: groupId, name: 'E2E 상담 업종' });
  await db.insert(pgMatchingPolicies).values({ groupId, policy: { risk: 'gray', candidates: [candidate(first.id), candidate(second.id)] } });
  await db.insert(rfpMatchingRequests).values({ rfpId: row.id, groupId, industryName: 'E2E 상담 업종', risk: 'gray', buyerWsId: row.buyerWsId, requestKey: randomUUID(), requestPayloadHash: 'e2e' });
  await db.insert(rfpPgReviews).values({ id: reviewId, rfpId: row.id, pgWorkspaceId: first.id, status: 'requested', candidate: { ...candidate(first.id), name: first.name } });
  await db.update(rfps).set({ deadline: new Date('2020-01-01T09:00:00Z') }).where(eq(rfps.id, row.id));
  try {
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${row.code}`);
    await expect(page.getByRole('heading', { name: '견적 마감일까지 답변이 도착하지 않았어요' })).toBeVisible();
    await page.getByRole('radio', { name: /KG이니시스/ }).check();
    await expect(page.getByRole('group', { name: '영업일 기간' })).toBeVisible();
    await page.getByRole('button', { name: '다음 PG사에 상담 요청하기' }).click();
    await expect(page.getByRole('dialog', { name: '현재 상담을 종료하고 다음 PG사에 요청할까요?' })).toBeVisible();
    await page.getByRole('button', { name: '현재 상담을 종료하고 요청하기' }).click();
    await expect.poll(async () => (await db.select().from(rfpPgReviews).where(eq(rfpPgReviews.id, reviewId)))[0].status).toBe('buyer_ended');
    await expect(page.getByRole('heading', { name: 'KG이니시스에 상담을 요청했어요' })).toBeVisible();
  } finally {
    await db.update(rfps).set({ deadline: original }).where(eq(rfps.id, row.id));
    await db.delete(rfpMatchingRequests).where(eq(rfpMatchingRequests.rfpId, row.id));
    await db.delete(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, groupId));
  }
});

test('모바일·다크 모드에서 연장 다이얼로그의 달력이 화면 안에 맞고 키보드로 닫힌다', async ({ page }) => {
  await loginAs(page, 'buyer');
  await page.goto('/rfp/P-2604-0001');
  await page.getByRole('button', { name: '마감일 연장' }).click();
  const trigger = page.getByRole('button', { name: /새 견적 마감일 날짜 선택/ });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 700 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await trigger.click();
    const popup = page.getByRole('dialog', { name: '새 견적 마감일 달력' });
    await expect(popup).toBeVisible();
    const bounds = await popup.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const overflow = await popup.evaluate(element => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});
