import { randomUUID } from 'node:crypto';
import { test, expect, type Page, type TestInfo } from 'playwright/test';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { bids, rfps, rfpInvitations, rfpAllowedPg, rfpMatchingRequests, rfpPgReviews, signingContracts, users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { emailFor, rfpUuidFromCode } from './_helpers';

// Dedicated actors keep this state matrix independent of the shared award/PG specs.
const cleanups: Array<() => Promise<void>> = [];
test.afterEach(async ({ page }) => {
  await page.close();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function createActor(nextCode: number) {
  const [source] = await db.select().from(users).where(eq(users.email, emailFor('buyer')));
  const [sourceRfp] = await db.select().from(rfps).where(eq(rfps.id, await rfpUuidFromCode('P-2604-0001')));
  const [sourceBid] = await db.select().from(bids).where(eq(bids.rfpId, sourceRfp.id));
  const [pg] = await db.select().from(workspaces).where(eq(workspaces.id, sourceBid.pgWsId));
  const [workspace] = await db.insert(workspaces).values({ type: 'buyer', name: '고객 흐름 검증', status: 'active', bizProfileId: sourceRfp.bizProfileId }).returning();
  const [user] = await db.insert(users).values({
    email: `buyer-flow-${randomUUID()}@example.com`, passwordHash: source.passwordHash,
    name: '고객 담당자', emailVerified: true, onboarding: source.onboarding, lastActiveWorkspaceId: workspace.id,
  }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: 'admin' });
  cleanups.push(async () => {
    await db.delete(rfps).where(eq(rfps.buyerWsId, workspace.id));
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  async function request(title: string, awarded = false) {
    const [rfp] = await db.insert(rfps).values({
      ...sourceRfp, id: randomUUID(), code: `P-2610-${nextCode++}`, shareToken: randomUUID(),
      buyerWsId: workspace.id, createdBy: user.id, title, status: 'sent', awardedBidId: null,
      requiredPaymentMethods: ['card', 'bank_transfer'],
      deadline: new Date(Date.now() + 3 * 86_400_000), sentAt: new Date(Date.now() - 5 * 86_400_000),
    }).returning();
    await db.insert(rfpAllowedPg).values({ rfpId: rfp.id, pgWsId: pg.id });
    const [invitation] = await db.insert(rfpInvitations).values({
      rfpId: rfp.id, pgWsId: pg.id, status: 'opened', tokenHash: randomUUID(),
      expiresAt: rfp.deadline, sentAt: new Date(), acceptedByUserId: sourceBid.submittedBy,
    }).returning();
    const [bid] = await db.insert(bids).values({
      ...sourceBid, id: randomUUID(), rfpId: rfp.id, invitationId: invitation.id,
      status: awarded ? 'submitted' : 'draft', round: 1, boardColumnId: null,
      paymentFees: { card: 0.022, bank_transfer: 0.018 },
    }).returning();
    await db.insert(rfpMatchingRequests).values({
      rfpId: rfp.id, buyerWsId: workspace.id, industryName: '일반 판매', risk: 'white',
      requestKey: randomUUID(), requestPayloadHash: 'buyer-flow-e2e',
    });
    const [review] = await db.insert(rfpPgReviews).values({
      rfpId: rfp.id, pgWorkspaceId: pg.id, status: awarded ? 'quoted' : 'requested',
      candidate: { pgWorkspaceId: pg.id, name: pg.name, reason: '일반 판매 상담', feeMin: null, feeMax: null, feeNote: '' },
    }).returning();
    if (awarded) {
      await db.update(rfps).set({ status: 'awarded', awardedBidId: bid.id }).where(eq(rfps.id, rfp.id));
      await db.insert(signingContracts).values({ rfpId: rfp.id, createdBy: user.id, kind: 'platform_buyer' });
    }
    return { rfp, bid, review };
  }
  return { user, workspace, request };
}

async function capture(page: Page, testInfo: TestInfo, state: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${state}.png`), fullPage: true, animations: 'disabled' });
}

for (const [index, width] of [1440, 390, 320].entries()) {
  test(`구매사 이어하기 상태와 배치 — ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const actor = await createActor(9000 + index * 10);
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto('/login');
    await page.getByLabel('이메일', { exact: true }).fill(actor.user.email);
    await page.locator('input[name="password"]').fill('password123');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 60_000 });
    await expect(page.getByRole('link', { name: '첫 견적 요청하기' })).toBeVisible();
    await capture(page, testInfo, 'first-home');

    const current = await actor.request('온라인 쇼핑몰 결제 수수료 개선 요청');
    const draft = await actor.request('정기결제 서비스 PG 도입', true);
    await page.goto(`/rfp/${current.rfp.code}`);
    await expect(page.getByRole('region', { name: '상담 진행' })).toBeVisible();
    await expect(page.getByText(/PG사 담당자가 영업일 기준/)).toBeVisible();
    await capture(page, testInfo, 'waiting');

    await db.update(bids).set({ status: 'submitted' }).where(eq(bids.id, current.bid.id));
    await db.update(rfpPgReviews).set({ status: 'quoted' }).where(eq(rfpPgReviews.id, current.review.id));
    await page.goto('/home');
    const quote = page.getByRole('link', { name: `${current.rfp.title} · 견적 확인하기` });
    await expect(quote).toBeVisible();
    await expect(page.getByRole('link', { name: `${draft.rfp.title} · 합의서 작성하기` })).toHaveAttribute('href', `/rfp/${draft.rfp.code}?tab=contract`);
    await capture(page, testInfo, 'active-home');
    await quote.click();
    const help = page.getByRole('button', { name: '상담 이력과 도움말' });
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: '상담 진행' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /이 견적 선정하기/ })).toBeVisible();
    await capture(page, testInfo, 'quoted');
    await help.click();
    await expect(page.getByRole('link', { name: '다른 PG 상담을 문의해요' })).toBeVisible();
    await help.click();
    const fees = page.getByRole('button', { name: /전체 결제수단 요율/ });
    await fees.click();
    await expect(fees).toHaveAttribute('aria-expanded', 'true');
    await fees.click();

    for (const status of ['rejected', 'withdrawn', 'buyer_ended'] as const) {
      await db.update(rfpPgReviews).set({ status, reason: '현재 사업 조건으로는 상담을 진행하기 어려워요.' }).where(eq(rfpPgReviews.id, current.review.id));
      await page.reload();
      await expect(page.getByRole('region', { name: '상담 진행' })).toBeVisible();
      await expect(page.getByText('현재 사업 조건으로는 상담을 진행하기 어려워요.')).toBeVisible();
      await expect(help).toHaveCount(0);
      await capture(page, testInfo, status);
    }
    await db.update(rfpPgReviews).set({ status: 'requested', reason: '' }).where(eq(rfpPgReviews.id, current.review.id));
    await db.update(rfps).set({ deadline: new Date(Date.now() - 86_400_000) }).where(eq(rfps.id, current.rfp.id));
    await page.reload();
    await expect(page.getByRole('heading', { name: '견적 마감일까지 답변이 도착하지 않았어요' })).toBeVisible();
    await capture(page, testInfo, 'response-expired');

    await db.update(rfpPgReviews).set({ status: 'quoted' }).where(eq(rfpPgReviews.id, current.review.id));
    await db.update(rfps).set({ deadline: current.rfp.deadline }).where(eq(rfps.id, current.rfp.id));
    await page.reload();
    await page.getByRole('button', { name: /이 견적 선정하기/ }).click();
    await page.getByRole('button', { name: '선정할게요', exact: true }).click();
    const result = page.getByRole('dialog', { name: /최종 계약 조건 협의를.*마쳤어요/ });
    await expect(result).toBeVisible({ timeout: 20_000 });
    await capture(page, testInfo, 'award-result');
    await result.getByRole('button', { name: '합의서 작성하기' }).click();
    await expect(page.getByRole('tab', { name: '합의서 작성', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
    await expect(page.getByLabel('구매사 상호', { exact: true })).toBeVisible();
    await capture(page, testInfo, 'agreement');
    const [contract] = await db.select().from(signingContracts).where(eq(signingContracts.rfpId, current.rfp.id));
    expect(contract).toMatchObject({ kind: 'platform_buyer', status: 'awaiting_pg_template', providerRef: null });
    await page.goto('/home');
    await expect(page.getByRole('link', { name: `${current.rfp.title} · 합의서 작성하기` })).toBeVisible();

    await db.update(signingContracts).set({ status: 'completed', completedAt: new Date() }).where(eq(signingContracts.id, contract.id));
    await page.reload();
    await expect(page.getByRole('link', { name: `${current.rfp.title} · 합의서 작성하기` })).toHaveCount(0);
    await page.goto(`/rfp/${current.rfp.code}?tab=contract`);
    await expect(page.getByRole('tab', { name: '서명 완료', exact: true })).toHaveAttribute('aria-selected', 'true');
    await capture(page, testInfo, 'completed');
    expect(pageErrors).toEqual([]);
  });
}
