import { test, expect } from 'playwright/test';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { bids, rfps, signingContracts, signingAgreementDrafts, pgAgreementRates, users } from '@/lib/db/schema';
import { loginAs, emailFor, rfpUuidFromCode, findSeededBidIds } from './_helpers';

// Full Chromium's new headless mode includes the native PDF viewer.
test.use({ channel: 'chromium' });

// Other e2e specs share these seeded actors and quote. Restore every field this
// spec changes, including on an assertion failure, so file order cannot leak state.
const restore: Array<() => Promise<unknown>> = [];
test.afterEach(async () => {
  const results = await Promise.allSettled(
    restore
      .splice(0)
      .reverse()
      .map((cleanup) => cleanup()),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
});

// Test DB only. No external contract is sent: stop at the confirmation dialog.
test('PG 홈·목록에서 합의서 작성·초안 재진입·PDF 미리보기와 구매사 읽기 경계', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const rfpId = await rfpUuidFromCode('P-2604-0001');
  const ids = await findSeededBidIds('P-2604-0001');
  // Award the latest toss round, as a real award does. Scenario E leaves a
  // round-2 bid on this RFP, and the PG inbox classifies by the latest round.
  const [seeded] = await db.select().from(bids).where(eq(bids.id, ids.toss));
  const [bid] = await db
    .select()
    .from(bids)
    .where(and(eq(bids.rfpId, seeded.rfpId), eq(bids.pgWsId, seeded.pgWsId)))
    .orderBy(desc(bids.round))
    .limit(1);
  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, rfpId));
  restore.push(async () =>
    db
      .update(bids)
      .set({ paymentFees: bid.paymentFees, customFees: bid.customFees })
      .where(eq(bids.id, bid.id)),
  );
  restore.push(async () =>
    db
      .update(rfps)
      .set({ status: rfp.status, awardedBidId: rfp.awardedBidId })
      .where(eq(rfps.id, rfpId)),
  );
  const [oldRates] = await db
    .select()
    .from(pgAgreementRates)
    .where(eq(pgAgreementRates.pgWsId, bid.pgWsId));
  restore.push(async () =>
    oldRates
      ? db
          .insert(pgAgreementRates)
          .values(oldRates)
          .onConflictDoUpdate({ target: pgAgreementRates.pgWsId, set: oldRates })
      : db.delete(pgAgreementRates).where(eq(pgAgreementRates.pgWsId, bid.pgWsId)),
  );
  await db
    .update(bids)
    .set({ paymentFees: { bank_transfer: 0.018 }, customFees: {} })
    .where(eq(bids.id, bid.id));
  await db.update(rfps).set({ status: 'awarded', awardedBidId: bid.id }).where(eq(rfps.id, rfpId));
  await db
    .insert(pgAgreementRates)
    .values({
      pgWsId: bid.pgWsId,
      rates: [{ key: 'bank_transfer', rate: 0.02 }],
    })
    .onConflictDoUpdate({
      target: pgAgreementRates.pgWsId,
      set: { rates: [{ key: 'bank_transfer', rate: 0.02 }] },
    });
  // The preceding award scenario can leave the awaiting contract for this
  // seeded RFP. Reuse it: the DB permits only one active contract per RFP.
  const activeContract = (await db.select().from(signingContracts).where(eq(signingContracts.rfpId, rfpId)))
    .find((row) => ['awaiting_pg_template', 'sent', 'in_progress'].includes(row.status));
  if (activeContract && activeContract.status !== 'awaiting_pg_template') {
    throw new Error(`Expected an awaiting contract, found ${activeContract.status}`);
  }
  const [contract] = activeContract
    ? [activeContract]
    : await db.insert(signingContracts).values({ rfpId, createdBy: rfp.createdBy }).returning();
  const existingDraft = await db.select({ contractId: signingAgreementDrafts.contractId })
    .from(signingAgreementDrafts)
    .where(eq(signingAgreementDrafts.contractId, contract.id));
  expect(existingDraft).toHaveLength(0);
  restore.push(async () => {
    await db.delete(signingAgreementDrafts).where(eq(signingAgreementDrafts.contractId, contract.id));
    if (!activeContract) await db.delete(signingContracts).where(eq(signingContracts.id, contract.id));
  });
  for (const role of ['buyer', 'pg-toss'] as const) {
    const [before] = await db
      .select({ id: users.id, onboarding: users.onboarding, phone: users.phone })
      .from(users)
      .where(eq(users.email, emailFor(role)));
    restore.push(async () =>
      db.update(users).set({ onboarding: before.onboarding, phone: before.phone }).where(eq(users.id, before.id)),
    );
    await db
      .update(users)
      .set({ onboarding: { _v: 1, buyerTutorial: { completedAt: new Date().toISOString() }, pgTutorial: { completedAt: new Date().toISOString() } }, phone: null })
      .where(eq(users.email, emailFor(role)));
  }

  await loginAs(page, 'pg-toss');
  await page.goto('/home');
  const homeTask = page.getByRole('link', { name: /합의서 작성하기/ });
  await expect(homeTask).toHaveAttribute('href', '/inbox/P-2604-0001?tab=contract');
  await homeTask.click({ trial: true });
  await page.screenshot({ path: testInfo.outputPath('pg-home-entry.png'), fullPage: true, animations: 'disabled' });
  await homeTask.click();
  await expect(page.getByRole('tab', { name: /^계약/ })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  await page.getByRole('button', { name: '합의서 작성하기' }).click();
  for (const side of ['구매사', 'PG사']) {
    await page.getByLabel(`${side} 상호`, { exact: true }).fill(`${side} 테스트 회사`);
    await page.getByLabel(`${side} 사업자등록번호`).fill('1234567890');
    await page.getByLabel(`${side} 주소`, { exact: true }).fill('서울시 강남구 테헤란로 123');
    await page.getByLabel(`${side} 대표자명`).fill('김대표');
  }
  await page.getByRole('button', { name: '임시 저장', exact: true }).click();
  await expect(page.getByText('회사 정보를 저장했어요.', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: '장기계약 부속합의서 작성', exact: true }).getByRole('button', { name: '닫기', exact: true }).click();
  await page.goto('/inbox');
  await expect(page.getByRole('link', { name: '이어서 작성하기', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pg-inbox-entry.png'), fullPage: true });
  await page.getByRole('link', { name: '이어서 작성하기', exact: true }).click();
  await page.getByRole('button', { name: '이어서 작성하기', exact: true }).click();
  await expect(page.getByLabel('구매사 상호', { exact: true })).toHaveValue('구매사 테스트 회사');
  await expect(page.getByRole('button', { name: '양측에 서명 요청하기' })).toBeDisabled();
  const pdfResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/signing/agreements/${contract.id}/document`),
  );
  await page.getByRole('button', { name: '저장하고 미리보기' }).click();
  const response = await pdfResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  // Chromium's native PDF handler transfers bytes but may expose an empty CDP body.
  // Read through the same authenticated HTTP session to verify the actual document.
  const pdf = await page.request.get(response.url());
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByTitle('발송할 합의서 PDF')).toBeVisible();
  await expect(page.getByText('휴대폰 인증 필요', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '양측에 서명 요청하기' })).toBeDisabled();
  // Simulate phone registration in each signer's profile, then recheck in-place.
  for (const role of ['buyer', 'pg-toss'] as const) {
    await db.update(users).set({ phone: '01012345678' }).where(eq(users.email, emailFor(role)));
  }
  await page.getByRole('button', { name: '서명 준비 상태 확인', exact: true }).click();
  await expect(page.getByText('서명 요청 가능', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('구매사 상호', { exact: true })).toHaveValue('구매사 테스트 회사');
  // Signer changes invalidate the old preview stamp; review the current document.
  await page.getByRole('button', { name: '저장하고 미리보기', exact: true }).click();
  await expect(page.getByTitle('발송할 합의서 PDF')).toBeVisible();
  await expect(page.getByRole('button', { name: '양측에 서명 요청하기' })).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath('pg-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '정보 입력', exact: true }).click();
  await expect(page.getByLabel('구매사 상호', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('pg-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '양측에 서명 요청하기' }).click();
  await expect(page.getByRole('heading', { name: '양측에 서명을 요청할까요?' })).toBeVisible();
  await page.getByRole('button', { name: '계속 확인하기', exact: true }).click();
  await page.getByRole('dialog', { name: '장기계약 부속합의서 작성', exact: true }).getByRole('button', { name: '닫기', exact: true }).click();
  await page.goto('/home');
  await expect(page.getByRole('link', { name: /이어서 작성하기/ })).toBeVisible();
  await page.goto('/inbox/P-2604-0001');
  await expect(page.getByRole('button', { name: '이어서 작성하기', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pg-mobile-entry.png'), fullPage: true });
  await page.getByRole('button', { name: '이어서 작성하기', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^계약/ })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });

  // Release the PG tab's live streams before checking the other actor.
  await page.close();
  const buyerContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  const buyerPage = await buyerContext.newPage();
  try {
    await loginAs(buyerPage, 'buyer');
    await buyerPage.goto('/rfp/P-2604-0001?tab=contract');
    await expect(
      buyerPage.getByRole('heading', {
        name: 'PG사가 합의서를 준비하고 있어요',
      }),
    ).toBeVisible();
    await expect(buyerPage.getByRole('button', { name: '합의서 작성하기' })).toHaveCount(0);
    expect(
      (await buyerContext.request.get(`/api/signing/agreements/${contract.id}/document`)).status(),
    ).toBe(403);
    await buyerPage.screenshot({
      path: testInfo.outputPath('buyer-desktop.png'),
      fullPage: true,
    });
  } finally {
    await buyerContext.close();
  }
});
